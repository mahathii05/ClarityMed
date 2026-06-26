"""
Actions route — powered by a CrewAI multi-agent pipeline.

Agents
------
1. ClinicalAdvisor    – interprets findings and flags urgency; recommends
                        doctor visits, medication reviews, and follow-up tests.
2. FitnessCoach       – designs a safe, personalised exercise plan based on
                        the clinical findings (what to do AND what to avoid).
3. LifestyleCoordinator – integrates clinical + fitness advice, adds lifestyle
                          and mental-health actions, identifies warning signs.
4. ActionPlanFormatter  – quality-checks and emits final strict JSON.

Model: meta-llama/llama-4-scout-17b-16e-instruct via Groq
"""

from __future__ import annotations

import json
import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from crewai import Agent, Crew, LLM, Process, Task

router = APIRouter()

def get_llm() -> LLM:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or "your_groq" in api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")
    return LLM(
        model="groq/meta-llama/llama-4-scout-17b-16e-instruct",
        api_key=api_key,
        temperature=0.3,
        max_tokens=3000,
    )


def build_findings_summary(report: dict) -> str:
    return "\n".join(
        f"{f.get('test', '')}"
        f"{' (' + f['abbreviation'] + ')' if f.get('abbreviation') else ''}: "
        f"{f.get('value', '')} [Range: {f.get('referenceRange', '')}] "
        f"— {f.get('severity', '')}. {f.get('plainExplanation', '')}"
        for f in report.get("findings", [])
    )


# ── Request schema ───────────────────────────────────────────────────────────

class ActionsRequest(BaseModel):
    reportData: dict


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_actions(body: ActionsRequest):
    report = body.reportData
    if not report:
        raise HTTPException(status_code=400, detail="reportData is required")

    llm = get_llm()
    findings_summary = build_findings_summary(report)
    report_type = report.get("reportType", "Medical Report")
    summary = report.get("summary", "")

    patient_context = (
        f"Report type: {report_type}\n"
        f"Overall summary: {summary}\n\n"
        f"Lab findings:\n{findings_summary}"
    )

    # ── Agent 1: Clinical Advisor ────────────────────────────────────────────
    clinical_advisor = Agent(
        role="Clinical Patient Advisor",
        goal=(
            "Assess the urgency of the patient's lab results, recommend appropriate "
            "medical appointments, medication reviews, and follow-up tests with "
            "clear timeframes tied to the specific findings."
        ),
        backstory=(
            "You are a senior GP with 20 years of experience triaging lab results "
            "and coordinating patient care. You are calm, clear, and always prioritise "
            "patient safety without causing unnecessary alarm."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Agent 2: Fitness Coach ────────────────────────────────────────────────
    fitness_coach = Agent(
        role="Medical Fitness Coach",
        goal=(
            "Design a safe, evidence-based exercise plan tailored to this patient's "
            "specific lab results — recommending what to do AND what to avoid, with "
            "clear reasons for each choice."
        ),
        backstory=(
            "You are a certified exercise physiologist who specialises in clinical "
            "populations. You know how conditions like diabetes, anaemia, cardiovascular "
            "disease, and kidney issues affect exercise prescription."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Agent 3: Lifestyle Coordinator ──────────────────────────────────────
    lifestyle_coordinator = Agent(
        role="Holistic Lifestyle Coordinator",
        goal=(
            "Integrate the clinical and fitness guidance, add lifestyle and mental-health "
            "actions, and compile a prioritised master action list with warning signs "
            "the patient should watch for."
        ),
        backstory=(
            "You are a health coach and wellness coordinator who bridges clinical advice "
            "and daily life. You are empathetic, practical, and skilled at helping patients "
            "make sustainable lifestyle changes."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Agent 4: JSON Formatter ──────────────────────────────────────────────
    action_formatter = Agent(
        role="Action Plan Formatter",
        goal=(
            "Take the complete action plan and output it as a single valid JSON object "
            "matching the exact required schema — no markdown, no prose, only JSON."
        ),
        backstory=(
            "You are a precise data engineer who transforms clinical content into "
            "structured JSON payloads consumed by patient-facing apps."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Tasks ────────────────────────────────────────────────────────────────
    task_clinical = Task(
        description=(
            f"Review the patient's lab data below. Determine:\n"
            f"1. Overall urgency level (Immediate / Soon / Routine) with a one-sentence reason.\n"
            f"2. 2-3 recommended doctor-visit or medication-review actions with timeframes.\n"
            f"3. 2-3 follow-up tests with timing and reasons.\n\n"
            f"{patient_context}"
        ),
        expected_output=(
            "Urgency level + reason, doctor visit / medication actions with timeframes, "
            "follow-up test schedule."
        ),
        agent=clinical_advisor,
    )

    task_fitness = Task(
        description=(
            "Based on the patient's lab findings, design a personalised exercise plan:\n"
            "- Weekly goal (e.g. 150 minutes moderate activity)\n"
            "- 3-4 recommended exercises with duration, frequency, and reason\n"
            "- 2-3 exercises to avoid and why\n\n"
            "Ensure every recommendation is safe given the specific findings."
        ),
        expected_output=(
            "Exercise plan: weekly goal, recommended exercises (with duration/frequency/reason), "
            "and exercises to avoid (with reasons)."
        ),
        agent=fitness_coach,
        context=[task_clinical],
    )

    task_lifestyle = Task(
        description=(
            "Using the clinical and fitness guidance, compile a complete prioritised action plan:\n"
            "- Merge all actions (doctor visits, exercise, lifestyle, follow-up tests, "
            "  medication reviews, mental health) into 5-8 actions sorted High → Medium → Low.\n"
            "- Add 2-3 lifestyle actions (sleep, stress, habits) relevant to the findings.\n"
            "- Add 3-5 specific warning signs the patient should watch for.\n"
            "Each action needs: category, priority, title, 2-3 sentence description, timeframe, "
            "related findings (test names), and an icon keyword.\n\n"
            "Allowed categories: Doctor Visit | Exercise | Lifestyle | Follow-up Test | "
            "Medication Review | Mental Health\n"
            "Allowed icons: stethoscope | dumbbell | heart | flask | pill | brain | walk | "
            "sun | moon | apple"
        ),
        expected_output=(
            "Complete prioritised action list (5-8 items) + warning signs list (3-5 items)."
        ),
        agent=lifestyle_coordinator,
        context=[task_clinical, task_fitness],
    )

    task_format = Task(
        description=(
            "Format the complete action plan as a JSON object with EXACTLY this structure "
            "(output ONLY the JSON — no markdown fences, no preamble):\n\n"
            '{\n'
            '  "urgencyLevel": "Immediate|Soon|Routine",\n'
            '  "urgencyReason": "string",\n'
            '  "actions": [\n'
            '    {\n'
            '      "id": "unique_string",\n'
            '      "category": "Doctor Visit|Exercise|Lifestyle|Follow-up Test|Medication Review|Mental Health",\n'
            '      "priority": "High|Medium|Low",\n'
            '      "title": "string",\n'
            '      "description": "string",\n'
            '      "timeframe": "string",\n'
            '      "relatedFindings": ["string"],\n'
            '      "icon": "stethoscope|dumbbell|heart|flask|pill|brain|walk|sun|moon|apple"\n'
            '    }\n'
            '  ],\n'
            '  "exercisePlan": {\n'
            '    "weeklyGoal": "string",\n'
            '    "recommended": [\n'
            '      {"exercise": "string", "duration": "string", "frequency": "string", "reason": "string"}\n'
            '    ],\n'
            '    "toAvoid": [\n'
            '      {"exercise": "string", "reason": "string"}\n'
            '    ]\n'
            '  },\n'
            '  "followUpSchedule": [\n'
            '    {"test": "string", "when": "string", "reason": "string"}\n'
            '  ],\n'
            '  "warningSignsToWatch": ["string"]\n'
            '}'
        ),
        expected_output="A valid JSON object matching the exact schema above.",
        agent=action_formatter,
        context=[task_lifestyle],
    )

    # ── Crew ─────────────────────────────────────────────────────────────────
    crew = Crew(
        agents=[clinical_advisor, fitness_coach, lifestyle_coordinator, action_formatter],
        tasks=[task_clinical, task_fitness, task_lifestyle, task_format],
        process=Process.sequential,
        verbose=False,
    )

    result = await crew.kickoff_async()
    raw = str(result)

    # Strip markdown fences if any
    clean = re.sub(r"```json\n?", "", raw)
    clean = re.sub(r"```\n?", "", clean).strip()

    # Extract JSON object
    match = re.search(r"\{[\s\S]*\}", clean)
    if not match:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON from actions crew.")
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {exc}")
