# ClarityMed — CrewAI Agent Architecture

Both the **Diet** and **Actions** endpoints now use multi-agent pipelines
powered by [CrewAI](https://github.com/joaomdmoura/crewAI) and the
`meta-llama/llama-4-scout-17b-16e-instruct` model served by Groq.

---

## Diet Pipeline  (`/api/diet/generate`)

```
Patient Lab Report
      │
      ▼
┌─────────────────────┐
│  NutritionAnalyst   │  Reads findings, identifies nutritional implications
│  (Agent 1)          │  for every abnormal marker.
└────────┬────────────┘
         │ passes nutritional assessment
         ▼
┌─────────────────────┐
│   MealPlanner       │  Builds daily meals (breakfast/lunch/dinner/snacks),
│   (Agent 2)         │  foods to eat, foods to avoid, hydration, meal-prep idea.
└────────┬────────────┘
         │ passes complete meal plan
         ▼
┌─────────────────────┐
│   DietReviewer      │  Quality-checks and outputs strict JSON
│   (Agent 3)         │  matching DietPlanner.jsx's expected schema.
└─────────────────────┘
         │
         ▼
      JSON Response
```

---

## Actions Pipeline  (`/api/actions/generate`)

```
Patient Lab Report
      │
      ▼
┌──────────────────────┐
│  ClinicalAdvisor     │  Determines urgency, recommends doctor visits,
│  (Agent 1)           │  medication reviews, and follow-up tests.
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  FitnessCoach        │  Designs safe exercise plan (recommended + to avoid)
│  (Agent 2)           │  based on the specific lab findings.
└────────┬─────────────┘
         │ both outputs
         ▼
┌──────────────────────┐
│  LifestyleCoordinator│  Merges clinical + fitness guidance, adds lifestyle
│  (Agent 3)           │  and mental-health actions, compiles warning signs.
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  ActionFormatter     │  Outputs final strict JSON matching NextActions.jsx
│  (Agent 4)           │  schema (urgencyLevel, actions[], exercisePlan, etc.)
└──────────────────────┘
         │
         ▼
      JSON Response
```

---

## Setup

```bash
# 1. Install dependencies
cd server
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# → Add your GROQ_API_KEY to .env

# 3. Run server
python main.py
```

The rest of the project (report simplification, chat, audio) continues to
use the existing direct Groq HTTP calls — only the diet and actions routes
have been upgraded to the CrewAI agent pipeline.

---

## Why agents for diet & exercise?

A single LLM call works fine for structured extraction (report simplification)
or short replies (chat). Diet planning and action planning benefit from
**specialisation and sequential reasoning**:

| Single-call approach | Multi-agent approach |
|---|---|
| One prompt trying to be analyst + planner + validator | Each agent has a focused role and deep backstory |
| Errors in analysis flow silently into the plan | Each agent reviews the previous agent's output |
| Hard to extend without rewriting the prompt | Add a new agent (e.g. PharmaAdvisor) without touching others |

