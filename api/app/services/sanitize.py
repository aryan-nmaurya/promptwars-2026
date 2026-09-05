"""Defensive cleaning of student input before it reaches a Gemini prompt.

Prompt injection cannot be fully solved by filtering, so this does three
cheaper things that together make it uninteresting to attempt:

1. Strips characters that let text hide or restructure a prompt - control
   codes, zero-width joiners, bidi overrides.
2. Removes the scaffolding an injection needs: role markers ("system:"),
   fenced blocks, and our own delimiter token.
3. Caps length, so a wall of text cannot push the real instructions out of
   the model's attention.

The remaining defence is structural: `wrap_untrusted` fences the input in an
explicit delimiter and the system instruction tells the model that anything
inside it is data, never instructions.
"""

from __future__ import annotations

import re
import unicodedata

DELIMITER = "<<<STUDENT_INPUT>>>"

# Zero-width and bidi characters: invisible on screen, meaningful to a model.
_INVISIBLE = re.compile(r"[​-‏‪-‮⁠-⁤﻿]")

# Chat role markers at the start of a line - the shape an injection uses to
# pretend the conversation has moved on to a new turn.
_ROLE_MARKER = re.compile(
    r"^\s*(system|assistant|user|model|developer|tool)\s*:", re.IGNORECASE | re.MULTILINE
)

# Common override openers. Defused rather than dropped, so the text still reads
# naturally and we are not silently editing someone's legitimate sentence.
_OVERRIDE = re.compile(
    r"\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+)?"
    r"(previous|prior|above|earlier|preceding|system)\s+"
    r"(instruction|instructions|prompt|prompts|rule|rules|context)\b",
    re.IGNORECASE,
)
_PERSONA = re.compile(
    r"\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|from\s+now\s+on)\b", re.IGNORECASE
)

_FENCE = re.compile(r"[`]{3,}|~{3,}")
_EXCESS_NEWLINES = re.compile(r"\n{3,}")
_EXCESS_SPACES = re.compile(r"[ \t]{3,}")


def sanitize_text(raw: str, *, max_length: int) -> str:
    """Return `raw` safe to embed in a prompt, truncated to `max_length`.

    Never raises: unusable input collapses to an empty string, and the caller's
    Pydantic minimum length rejects it with a 422.
    """
    if not raw:
        return ""

    text = unicodedata.normalize("NFKC", raw)
    text = _INVISIBLE.sub("", text)
    # Keep newline and tab; drop every other control character.
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch) != "Cc")

    text = text.replace(DELIMITER, "")
    text = _FENCE.sub("", text)
    text = _ROLE_MARKER.sub("", text)
    text = _OVERRIDE.sub("[redacted instruction]", text)
    text = _PERSONA.sub("[redacted instruction]", text)

    text = _EXCESS_NEWLINES.sub("\n\n", text)
    text = _EXCESS_SPACES.sub("  ", text)
    text = text.strip()

    return text[:max_length].strip()


def wrap_untrusted(label: str, value: str) -> str:
    """Fence student input so the model can tell data from instructions."""
    return f"{label} {DELIMITER}\n{value}\n{DELIMITER}"
