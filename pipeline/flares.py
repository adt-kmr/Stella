"""GOES flare-class utilities: parsing, ranking and human descriptions.

Thin, dependency-free helpers layered on top of
:func:`pipeline.thresholds.flare_class_float`, so every module ranks and
compares flare classes the same way.
"""

from __future__ import annotations

from .thresholds import flare_class_float

LETTER_ORDER = ("A", "B", "C", "M", "X")

NOAA_SCALE = {
    "A": "Below R1 (quiet)",
    "B": "Below R1 (quiet)",
    "C": "R1 (minor)",
    "M": "R1-R2 (minor-moderate)",
    "X": "R3+ (strong-severe)",
}


def parse_flare_class(label: str) -> tuple[str, float]:
    """Split ``"M3.5"`` into ``("M", 3.5)``; unknown input -> ``("B", 0.0)``."""
    text = (label or "").strip().upper()
    if not text or text[0] not in LETTER_ORDER:
        return ("B", 0.0)
    try:
        number = float(text[1:])
    except ValueError:
        number = 1.0
    return (text[0], number)


def flare_rank(label: str) -> int:
    """Ordinal rank ``A=0 ... X=4`` for a flare class."""
    letter, _ = parse_flare_class(label)
    return LETTER_ORDER.index(letter)


def compare_flares(left: str, right: str) -> int:
    """Return ``-1``/``0``/``1`` comparing two flare classes by magnitude."""
    a = flare_class_float(left)
    b = flare_class_float(right)
    return (a > b) - (a < b)


def is_at_least(label: str, floor: str) -> bool:
    """True when ``label`` is at or above the ``floor`` class."""
    return flare_class_float(label) >= flare_class_float(floor)


def describe_flare(label: str) -> str:
    """Short operator-facing description with the NOAA radio-blackout scale."""
    letter, number = parse_flare_class(label)
    return f"{letter}{number:g} ({NOAA_SCALE[letter]})"
