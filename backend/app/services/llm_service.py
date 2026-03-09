from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from app.config import settings

logger = logging.getLogger(__name__)

try:
    import anthropic as _anthropic
    _HAS_ANTHROPIC = True
except ImportError:
    _HAS_ANTHROPIC = False


@dataclass
class ExpandedTrigger:
    hypothetical_examples: list[str]
    keywords: list[str]
    exclusion_terms: list[str]


_FALLBACK_EMPTY = ExpandedTrigger(hypothetical_examples=[], keywords=[], exclusion_terms=[])

_PROMPT_TEMPLATE = """\
You are a content moderation assistant. Given a user's moderation trigger, \
generate realistic examples of triggering posts, high-signal keywords, and \
phrases that look similar but should NOT be flagged.

User trigger: "{trigger}"

Return a JSON object with exactly these keys:
- "examples": list of {n} realistic post titles that WOULD match this trigger
- "keywords": list of 5-8 high-signal terms closely associated with the trigger
- "exclusions": list of 2-4 phrases that look topically similar but should NOT be flagged

Return only valid JSON with no extra text."""


async def expand_trigger(raw_text: str) -> ExpandedTrigger:
    """Call Claude to generate hypothetical examples, keywords, and exclusions.

    Falls back gracefully to [raw_text] / empty lists if API key is missing or call fails.
    """
    if not settings.anthropic_api_key or not _HAS_ANTHROPIC:
        logger.warning("anthropic_api_key not set or anthropic package missing; using raw trigger as fallback")
        return ExpandedTrigger(
            hypothetical_examples=[raw_text],
            keywords=[],
            exclusion_terms=[],
        )

    try:
        client = _anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        prompt = _PROMPT_TEMPLATE.format(trigger=raw_text, n=settings.hyde_examples_count)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        return ExpandedTrigger(
            hypothetical_examples=data.get("examples", [raw_text]),
            keywords=data.get("keywords", []),
            exclusion_terms=data.get("exclusions", []),
        )
    except Exception as exc:
        logger.error("expand_trigger failed (%s); falling back to raw trigger", exc)
        return ExpandedTrigger(
            hypothetical_examples=[raw_text],
            keywords=[],
            exclusion_terms=[],
        )
