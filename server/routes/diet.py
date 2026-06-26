from __future__ import annotations
import json, os, re
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

class DietRequest(BaseModel):
    reportData: dict

@router.post("/generate")
async def generate_diet(body: DietRequest):
    report = body.reportData
    if not report:
        raise HTTPException(status_code=400, detail="reportData is required")

    llm = get_llm()
    findings_summary = build_findings_summary(report)
    patient_context = (
        f"Report type: {report.get('reportType', 'Medical Report')}\n"
        f"Overall summary: {report.get('summary', '')}\n\n"
        f"Lab findings:\n{findings_summary}"
    )

    nutrition_analyst = Agent(
        role="Clinical Nutrition Analyst",
        goal="Analyse the patient's lab findings and identify specific nutritional implications.",
        backstory="You are a board-certified clinical dietitian with 15 years of experience translating lab results into actionable nutritional insights.",
        llm=llm, verbose=False, allow_delegation=False,
    )
    meal_planner = Agent(
        role="Personalised Meal Planner",
        goal="Create a practical, personalised daily meal plan with foods to eat and avoid.",
        backstory="You are a culinary nutritionist who turns clinical advice into realistic meal ideas patients can follow.",
        llm=llm, verbose=False, allow_delegation=False,
    )
    diet_reviewer = Agent(
        role="Diet Plan Quality Reviewer",
        goal="Review the meal plan and output the final result as a strict JSON object — nothing else.",
        backstory="You are a senior clinical reviewer. You output ONLY valid JSON.",
        llm=llm, verbose=False, allow_delegation=False,
    )

    task_analyse = Task(
        description=f"Analyse the patient lab data and produce a nutritional assessment.\n\n{patient_context}",
        expected_output="Nutritional assessment: abnormal findings, dietary implications, key nutrients.",
        agent=nutrition_analyst,
    )
    task_plan = Task(
        description=(
            "Create a full personalised diet plan: headline, rationale, daily meals "
            "(breakfast/lunch/dinner/snacks with reasons), 5-6 foods to eat, 4-5 foods "
            "to avoid, hydration advice, weekly meal-prep idea."
        ),
        expected_output="Complete diet plan.",
        agent=meal_planner,
        context=[task_analyse],
    )
    task_review = Task(
        description=(
            'Output ONLY this JSON, no markdown:\n'
            '{"headline":"string","rationale":"string","dailyMeals":{"breakfast":[{"item":"string","reason":"string"}],"lunch":[{"item":"string","reason":"string"}],"dinner":[{"item":"string","reason":"string"}],"snacks":[{"item":"string","reason":"string"}]},"foodsToEat":[{"food":"string","benefit":"string"}],"foodsToAvoid":[{"food":"string","reason":"string"}],"hydration":"string","weeklyMealIdea":"string"}'
        ),
        expected_output="Valid JSON object only.",
        agent=diet_reviewer,
        context=[task_plan],
    )

    crew = Crew(
        agents=[nutrition_analyst, meal_planner, diet_reviewer],
        tasks=[task_analyse, task_plan, task_review],
        process=Process.sequential, verbose=False,
    )

    raw = str(await crew.kickoff_async())
    clean = re.sub(r"```json\n?", "", raw)
    clean = re.sub(r"```\n?", "", clean).strip()
    match = re.search(r"\{[\s\S]*\}", clean)
    if not match:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON from diet crew.")
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {exc}")