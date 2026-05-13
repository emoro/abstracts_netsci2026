"""Load NetSci 2026 poster rows from CSV (Show in the program = YES, non-dropped days)."""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path


def normalize_header(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().lower()


def header_lookup(fieldnames):
    return {normalize_header(name): name for name in fieldnames if name}


def row_value(row, lookup, aliases):
    for alias in aliases:
        key = lookup.get(normalize_header(alias))
        if not key:
            continue
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def show_in_program_yes(row, lookup) -> bool:
    v = row_value(row, lookup, ["Show in the program", "Show in program"])
    return v.upper() == "YES"


def read_filtered_posters(csv_path: Path) -> list:
    """Return poster dicts for program + embeddings (same filter)."""
    raw_lines = csv_path.read_text(encoding="utf-8", errors="replace").splitlines()
    header_idx = next(
        i for i, line in enumerate(raw_lines) if line.strip().startswith("Paper ID")
    )
    reader = csv.DictReader(io.StringIO("\n".join(raw_lines[header_idx:])))
    lookup = header_lookup(reader.fieldnames or [])
    rows = []
    for row in reader:
        if not show_in_program_yes(row, lookup):
            continue
        paper_id = row_value(row, lookup, ["Paper ID"])
        if not paper_id:
            continue
        day = row_value(row, lookup, ["Day"])
        if day.upper().startswith("DROPPED"):
            continue
        title = row_value(row, lookup, ["Paper Title", "Title"])
        abstract = row_value(row, lookup, ["Abstract"])
        if not title and not abstract:
            continue
        rows.append(
            {
                "id": str(paper_id).strip(),
                "title": title,
                "abstract": abstract,
                "authors": row_value(row, lookup, ["Author Names", "Authors"]),
                "speaker": row_value(
                    row, lookup, ["Primary Contact Author Name", "Registered Primary"]
                ),
                "day": day,
                "time": row_value(row, lookup, ["Time"]),
                "posterNumber": row_value(row, lookup, ["Poster #", "Poster"]),
                "posterType": row_value(row, lookup, ["Poster type", "Poster Type"]),
            }
        )
    return rows
