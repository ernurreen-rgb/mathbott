"""
AI drafts of twin tasks through any OpenAI-compatible Chat Completions provider.

Drafts are never served to students: a teacher approves each one. A separate
call re-solves every draft without seeing its answer, and the platform's own
answer checker compares the two, so a wrong recomputation is flagged.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import aiohttp
from pydantic import BaseModel, Field, ValidationError

from settings import get_settings

logger = logging.getLogger(__name__)

TWIN_DRAFTS_PER_REQUEST = 3

_ANSWER_FORMATS = {
    "input": 'the final value only, written like the source answer (LaTeX allowed, e.g. "35" or "\\frac{3}{4}")',
    "mcq": 'the label of the correct option, e.g. "B"; several correct options as a JSON array string, e.g. "[\\"A\\", \\"C\\"]"',
    "mcq6": 'the label of the correct option, e.g. "B"; several correct options as a JSON array string, e.g. "[\\"A\\", \\"C\\"]"',
    "tf": '"true" or "false"',
    "select": 'a JSON array string with the correct option label for each sub-question in order, e.g. "[\\"A\\", \\"C\\"]"',
}

_GENERATE_SYSTEM = """You create practice variants ("twins") of school math tasks for a Kazakh-language learning platform.
A twin keeps the exact wording, structure, solution method and difficulty of the source task and changes only the numbers, so that a student cannot reuse the answer they remember.

Rules:
- Keep every non-numeric part of the text exactly as in the source: the Kazakh wording, LaTeX commands, $...$ delimiters and formatting.
- Change the numbers so that the twin's answer differs from the source answer and from the other twins' answers.
- Keep numbers of the same kind and size: integers stay integers, fractions stay fractions, similar magnitude. Keep the answer as "nice" as the source answer.
- Recompute the answer yourself, carefully, before writing it. The answer must be correct for the new numbers.
- The answer uses exactly the same format as the source "answer" field ({answer_format}).
- Multiple choice: keep the same option labels and the same number of correct options; recompute the options so that exactly the right ones are correct, and make the wrong ones plausible typical mistakes, all different.
- True/false: the answer is "true" or "false" for the new numbers.
- Matching: keep the option list structure; each sub-question's "correct" label must match the answer array.
- "accepted_answers" lists other correct spellings of the answer (may be empty).

Return only a JSON object: {{"twins": [{{"text": "...", "answer": "...", "accepted_answers": [], "options": null or [{{"label": "A", "text": "..."}}], "subquestions": null or [{{"text": "...", "correct": "A"}}]}}]}}"""

_SOLVE_SYSTEM = """You solve a school math task. Work it out carefully, then return only a JSON object: {{"answer": "..."}}.
The answer is {answer_format}."""


class AiTwinError(Exception):
    """kind: not_configured, provider, timeout or invalid_output."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


class TwinOption(BaseModel):
    label: str = Field(min_length=1, max_length=4)
    text: str = Field(max_length=2000)


class TwinSubquestion(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    correct: str = Field(min_length=1, max_length=4)


class TwinDraft(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    answer: str = Field(min_length=1, max_length=1000)
    accepted_answers: List[str] = Field(default_factory=list, max_length=10)
    options: Optional[List[TwinOption]] = None
    subquestions: Optional[List[TwinSubquestion]] = None


class _DraftBatch(BaseModel):
    twins: List[TwinDraft]


class _Solved(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


def _parse_json_object(content: str) -> Any:
    # Some providers wrap JSON mode output in a Markdown fence.
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", content or "")
    try:
        return json.loads(cleaned)
    except ValueError as exc:
        raise AiTwinError("invalid_output", "ЖИ жауабы JSON емес.") from exc


async def _chat(system: str, user: str) -> str:
    settings = get_settings()
    if not settings.ai_twins_enabled:
        raise AiTwinError("not_configured", "ЖИ бапталмаған: AI_TWIN_BASE_URL, AI_TWIN_API_KEY және AI_TWIN_MODEL қажет.")
    url = f"{settings.ai_twin_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.ai_twin_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.ai_twin_api_key}"}
    try:
        timeout = aiohttp.ClientTimeout(total=settings.ai_twin_timeout_seconds)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=body, headers=headers) as response:
                text = await response.text()
                if response.status >= 400:
                    logger.warning("ai_twin_provider_error status=%s body=%s", response.status, text[:300])
                    raise AiTwinError("provider", f"ЖИ провайдері қате қайтарды (HTTP {response.status}).")
    except AiTwinError:
        raise
    except TimeoutError as exc:
        raise AiTwinError("timeout", "ЖИ уақытында жауап бермеді. Қайталап көріңіз.") from exc
    except aiohttp.ClientError as exc:
        raise AiTwinError("provider", "ЖИ провайдеріне қосылу мүмкін болмады.") from exc
    try:
        return json.loads(text)["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise AiTwinError("invalid_output", "ЖИ провайдерінің жауап пішімі түсініксіз.") from exc


def _task_for_prompt(task: Dict[str, Any], *, with_answer: bool) -> Dict[str, Any]:
    question_type = task.get("question_type") or "input"
    payload: Dict[str, Any] = {"question_type": question_type, "text": task.get("text") or ""}
    if task.get("options"):
        payload["options"] = [{"label": o.get("label"), "text": o.get("text", "")} for o in task["options"]]
    if task.get("subquestions"):
        payload["subquestions"] = [
            {"text": s.get("text", ""), **({"correct": s.get("correct")} if with_answer else {})}
            for s in task["subquestions"]
        ]
    if with_answer:
        payload["answer"] = task.get("answer") or ""
        payload["accepted_answers"] = task.get("accepted_answers") or []
    return payload


async def generate_twin_drafts(source: Dict[str, Any], count: int = TWIN_DRAFTS_PER_REQUEST) -> List[TwinDraft]:
    """Ask for `count` number-only twins of a source bank task; returns validated drafts."""
    answer_format = _ANSWER_FORMATS.get(source.get("question_type") or "input", _ANSWER_FORMATS["input"])
    user = (
        f"Source task (JSON):\n{json.dumps(_task_for_prompt(source, with_answer=True), ensure_ascii=False)}\n\n"
        f"Create {count} twins. Return JSON."
    )
    content = await _chat(_GENERATE_SYSTEM.format(answer_format=answer_format), user)
    try:
        batch = _DraftBatch.model_validate(_parse_json_object(content))
    except ValidationError as exc:
        raise AiTwinError("invalid_output", "ЖИ жауабының құрылымы дұрыс емес.") from exc
    return batch.twins[:count]


async def solve_task(task: Dict[str, Any]) -> str:
    """Solve a task without its answer; used to check an AI draft independently."""
    answer_format = _ANSWER_FORMATS.get(task.get("question_type") or "input", _ANSWER_FORMATS["input"])
    user = f"Task (JSON):\n{json.dumps(_task_for_prompt(task, with_answer=False), ensure_ascii=False)}\n\nReturn JSON."
    content = await _chat(_SOLVE_SYSTEM.format(answer_format=answer_format), user)
    try:
        return _Solved.model_validate(_parse_json_object(content)).answer
    except ValidationError as exc:
        raise AiTwinError("invalid_output", "ЖИ шешімінің құрылымы дұрыс емес.") from exc
