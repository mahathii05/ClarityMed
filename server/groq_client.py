"""Shared Groq API helper — key read from env, never exposed to frontend."""

import os
import re
import json
import httpx
from fastapi import HTTPException

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def get_api_key() -> str:
    key = os.getenv("GROQ_API_KEY", "")
    if not key or "your_groq" in key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")
    return key


async def groq_chat(
    model: str,
    messages: list[dict],
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    api_key = get_api_key()
    async with httpx.AsyncClient(timeout=60, verify=False) as client:
        resp = await client.post(
            GROQ_CHAT_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
    if not resp.is_success:
        try:
            error_data = resp.json()
            detail = error_data.get("error", {}).get("message", f"Groq error {resp.status_code}")
        except Exception:
            detail = f"Groq error {resp.status_code}: {resp.text}"

        # Handle rate limit by falling back to the next model in the chain
        MODEL_FALLBACKS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
        if (resp.status_code == 429 or "rate limit" in detail.lower()) and model in MODEL_FALLBACKS:
            try:
                curr_idx = MODEL_FALLBACKS.index(model)
                if curr_idx < len(MODEL_FALLBACKS) - 1:
                    next_model = MODEL_FALLBACKS[curr_idx + 1]
                    import sys
                    print(f"Rate limit hit on {model}. Falling back to {next_model}...", file=sys.stderr)
                    return await groq_chat(
                        model=next_model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens
                    )
            except ValueError:
                pass

        raise HTTPException(status_code=502, detail=detail)

    return resp.json()["choices"][0]["message"]["content"]


def parse_json(raw: str) -> dict:
    """Strip markdown fences then parse JSON."""
    clean = re.sub(r"```json\n?", "", raw)
    clean = re.sub(r"```\n?", "", clean).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {e}")
