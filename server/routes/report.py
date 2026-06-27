from fastapi import APIRouter
from pydantic import BaseModel
from groq_client import groq_chat, parse_json

router = APIRouter()

SYSTEM_PROMPT = """You are ClarityMed, an expert medical communicator. Transform complex medical lab reports into clear, compassionate plain-language summaries any patient can understand.

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "3-sentence plain-English overview of the most important findings",
  "patientName": "extracted name or null",
  "reportDate": "extracted date or null",
  "reportType": "type of report (e.g. Complete Blood Count, Lipid Panel)",
  "findings": [
    {
      "id": "unique_id_string",
      "test": "Test name",
      "abbreviation": "Abbreviation if any (e.g. HbA1c)",
      "abbreviationMeaning": "Full meaning of abbreviation",
      "value": "Patient value with units",
      "referenceRange": "Normal range",
      "severity": "Normal|Watch|Urgent",
      "plainExplanation": "2-3 sentences a patient can understand",
      "whatItMeans": "What this result means for the patient health",
      "suggestedQuestion": "A question the patient could ask their doctor",
      "originalSegment": "The exact verbatim text segment or line from the original report that matches this test/finding (e.g. 'Hemoglobin 9.2 g/dL [12.0 - 16.0]')"
    }
  ]
}

Severity rules:
- Normal: value within reference range
- Watch: mildly outside range, warrants monitoring
- Urgent: significantly outside range, requires prompt attention

Be compassionate, avoid alarm, always encourage consulting a doctor."""


import asyncio
from fastapi import HTTPException

class SimplifyRequest(BaseModel):
    reportText: str


class SimplifyImageRequest(BaseModel):
    images: list[str]  # base64 data URLs


async def run_translation_pipeline(report_text: str) -> dict:
    models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
    last_error = None

    for m in models:
        try:
            raw = await groq_chat(
                model=m,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Simplify this medical report:\n\n{report_text}"},
                ],
                max_tokens=4096,
            )
            return parse_json(raw)
        except Exception as e:
            import sys
            print(f"Model {m} failed: {e}", file=sys.stderr)
            last_error = e

    if isinstance(last_error, HTTPException):
        raise last_error
    raise HTTPException(status_code=502, detail=str(last_error))


async def perform_ocr(image_b64: str) -> str:
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Transcribe all text from this medical lab report image verbatim. "
                        "Do not explain, format, or summarize. Just output the extracted text."
                    )
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_b64
                    }
                }
            ]
        }
    ]
    raw_text = await groq_chat(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=messages,
        temperature=0.1,
        max_tokens=4096,
    )
    return raw_text


@router.post("/simplify")
async def simplify_report(body: SimplifyRequest):
    if not body.reportText.strip():
        raise HTTPException(status_code=400, detail="reportText is required")
    return await run_translation_pipeline(body.reportText)


@router.post("/simplify-image")
async def simplify_report_image(body: SimplifyImageRequest):
    if not body.images:
        raise HTTPException(status_code=400, detail="images list is required")

    try:
        ocr_tasks = [perform_ocr(img) for img in body.images]
        ocr_results = await asyncio.gather(*ocr_tasks)
        combined_text = "\n\n--- Page Break ---\n\n".join(ocr_results)
    except Exception as e:
        import sys
        print(f"OCR failed: {e}", file=sys.stderr)
        raise HTTPException(status_code=502, detail=f"Image transcription (OCR) failed: {e}")

    if not combined_text.strip():
        raise HTTPException(status_code=422, detail="No readable text could be extracted from the uploaded image(s).")

    structured_report = await run_translation_pipeline(combined_text)
    return {
        "report": structured_report,
        "ocrText": combined_text
    }

