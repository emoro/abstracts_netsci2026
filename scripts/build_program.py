#!/usr/bin/env python3
"""Build participant program.json from final sessions CSV and related catalog files."""

import csv
import io
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from poster_csv import read_filtered_posters

# Organizer lists (sessions, posters, lightning, schedule).
APP_ROOT = Path(__file__).resolve().parent.parent
CATALOG_DIR = APP_ROOT / "data" / "catalog"
# Embedding outputs and other pipeline-generated artifacts.
INTERMEDIATE_DIR = APP_ROOT / "data" / "intermediate"

SESSION_CSV = CATALOG_DIR / "NetSci2026_sessions - FINAL Netsci 2026 Sessions.csv"
POSTERS_CSV = CATALOG_DIR / "NetSci2026_sessions - Final Netsci 2026 Posters.csv"
LIGHTNING_CSV = CATALOG_DIR / "NetSci2026_sessions - Final Netsci 2026 Lighting.csv"
SCHEDULE_CSV = CATALOG_DIR / "NetSci2026_sessions - Conference Schedule (tentative).csv"
OUT_PATH = APP_ROOT / "public" / "program.json"

PARALLEL_ROOM_START_COL = 5
SLOT_MINUTES = 15
PARALLEL_DISPLAY_START_BY_DAY = {
    "Jun 3": "5:00 PM",
}

PALETTE = [
    "#C8352E", "#2E86C1", "#28B463", "#F39C12", "#8E44AD",
    "#E74C3C", "#1ABC9C", "#D4AC0D", "#5B2C6F", "#117A65",
    "#CA6F1E", "#2874A6", "#D35400", "#1A5276", "#7D3C98",
    "#239B56", "#B03A2E", "#148F77", "#6C3483", "#D68910",
]


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


def is_dropped(value: str) -> bool:
    return value.strip().upper() in ("YES", "Y", "1", "TRUE")


def session_color_group(label: str) -> str:
    s = label.strip()
    s = re.sub(r"^S\d+\s*[—-]\s*", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"^PS\s*\d+(?:\.\d+)?\s*[—-]\s*", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s+(?:[1-9]\d?|100)\s*$", "", s).strip()
    return s or label.strip()


def parse_time_minutes(value: str) -> int:
    text = (value or "").strip().upper()
    match = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", text)
    if not match:
        return 0
    hour = int(match.group(1))
    minute = int(match.group(2))
    meridiem = match.group(3)
    if meridiem == "PM" and hour != 12:
        hour += 12
    if meridiem == "AM" and hour == 12:
        hour = 0
    return hour * 60 + minute


def session_id(code: str, day: str, title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", f"{code}-{day}-{title}".lower()).strip("-")
    return slug or "session"


def read_csv_rows(path: Path):
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    header_idx = next(
        i for i, line in enumerate(raw_lines) if line.strip().startswith("Submission #")
    )
    reader = csv.DictReader(io.StringIO("\n".join(raw_lines[header_idx:])))
    return reader, header_lookup(reader.fieldnames or [])


def load_parallel_rows():
    reader, lookup = read_csv_rows(SESSION_CSV)
    rows = []
    for row in reader:
        if is_dropped(row_value(row, lookup, ["Dropped"])):
            continue
        talk_id = row_value(row, lookup, ["Submission #", "Submission ID"])
        if not talk_id.isdigit():
            continue
        session_name = row_value(row, lookup, ["Assigned Session"])
        session_code = row_value(row, lookup, ["Session #", "Session\xa0#"])
        if not session_name:
            continue
        rows.append(
            {
                "id": talk_id,
                "day": row_value(row, lookup, ["Day"]),
                "time": row_value(row, lookup, ["Time"]),
                "code": session_code,
                "sessionName": session_name,
                "title": row_value(row, lookup, ["Title", "Paper Title"]),
                "authors": row_value(row, lookup, ["Authors", "Author Name"]),
                "abstract": row_value(row, lookup, ["Abstract"]),
                "speaker": row_value(
                    row,
                    lookup,
                    [
                        "Primary speaker",
                        "Primary contact",
                        "Primary Contact Author Name",
                    ],
                ),
                "topic": row_value(row, lookup, ["Topic"]),
            }
        )
    return rows


def lightning_session_code(session_name: str) -> str:
    m = re.search(r"lighting\s*(\d+)", session_name or "", flags=re.IGNORECASE)
    if m:
        return f"LT {m.group(1)}"
    return (session_name or "LT").strip()[:20] or "LT"


def load_lightning_rows():
    if not LIGHTNING_CSV.is_file():
        return []
    raw_lines = LIGHTNING_CSV.read_text(encoding="utf-8").splitlines()
    header_idx = next(
        (i for i, line in enumerate(raw_lines) if line.strip().lower().startswith("paper id")),
        None,
    )
    if header_idx is None:
        return []
    reader = csv.DictReader(io.StringIO("\n".join(raw_lines[header_idx:])))
    lookup = header_lookup(reader.fieldnames or [])
    rows = []
    for row in reader:
        session_name = row_value(row, lookup, ["Session"])
        if not session_name or "drop" in session_name.lower():
            continue
        paper_id = row_value(row, lookup, ["Paper ID"])
        if not paper_id or not str(paper_id).strip().isdigit():
            continue
        day = row_value(row, lookup, ["Day"])
        time = row_value(row, lookup, ["Time"])
        title = row_value(row, lookup, ["Paper Title", "Title"])
        if not title:
            continue
        rows.append(
            {
                "paperId": paper_id.strip(),
                "sessionName": session_name.strip(),
                "day": day,
                "time": time,
                "title": title,
                "authors": row_value(row, lookup, ["Author Names", "Authors"]),
                "abstract": row_value(row, lookup, ["Abstract"]),
                "speaker": row_value(
                    row,
                    lookup,
                    ["Primary Contact Author Name", "Primary speaker", "Primary Contact"],
                ),
            }
        )
    return rows


def build_lightning_program(rows):
    sessions_by_key = {}
    talks_out = []
    for row in rows:
        key = (row["sessionName"], row["day"])
        if key not in sessions_by_key:
            sn = row["sessionName"]
            code = lightning_session_code(sn)
            sid = session_id(code, row["day"], sn)
            sessions_by_key[key] = {
                "id": sid,
                "code": code,
                "title": sn,
                "day": row["day"],
                "startTime": row["time"],
                "endTime": row["time"],
                "topic": "",
                "talkIds": [],
            }
        session = sessions_by_key[key]
        rid = f"L-{row['paperId']}"
        session["talkIds"].append(rid)
        if parse_time_minutes(row["time"]) < parse_time_minutes(session["startTime"]):
            session["startTime"] = row["time"]
        if parse_time_minutes(row["time"]) >= parse_time_minutes(session["endTime"]):
            session["endTime"] = row["time"]
        talks_out.append(
            {
                "id": rid,
                "sessionId": session["id"],
                "startTime": row["time"],
                "title": row["title"],
                "authors": row["authors"],
                "abstract": row["abstract"],
                "speaker": row["speaker"],
                "topic": "",
                "day": row["day"],
                "sessionCode": session["code"],
                "sessionTitle": session["title"],
            }
        )

    sessions = list(sessions_by_key.values())
    for session in sessions:
        session["talkIds"].sort(
            key=lambda tid: parse_time_minutes(
                next(t["startTime"] for t in talks_out if t["id"] == tid)
            )
        )
        session["label"] = (
            f"{session['code']} — {session['title']}" if session.get("code") else session["title"]
        )

    sessions.sort(
        key=lambda s: (
            s["day"],
            parse_time_minutes(s["startTime"]),
            s["code"],
            s["title"],
        )
    )

    group_order = []
    seen_groups = set()
    for session in sessions:
        group = session_color_group(session["title"])
        if group not in seen_groups:
            seen_groups.add(group)
            group_order.append(group)
    group_color = {g: PALETTE[i % len(PALETTE)] for i, g in enumerate(group_order)}
    for session in sessions:
        session["color"] = group_color[session_color_group(session["title"])]

    return sessions, talks_out


def clean_location(header: str) -> str:
    text = (header or "").strip()
    match = re.match(r"^(.+?)\s*\(\d+\)\s*$", text)
    return (match.group(1) if match else text).strip()


def normalize_schedule_day(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    match = re.search(r"June\s+(\d+)", text, flags=re.IGNORECASE)
    if match:
        return f"Jun {int(match.group(1))}"
    return ""


def extract_time_cell(value: str) -> str:
    text = (value or "").strip()
    match = re.search(r"(\d{1,2}:\d{2}\s*[AP]M)", text, flags=re.IGNORECASE)
    return match.group(1).upper().replace("  ", " ") if match else ""


def is_setup_title(text: str) -> bool:
    lowered = (text or "").strip().lower()
    return "set-up" in lowered or "setup" in lowered


def parallel_display_start_minutes(day: str) -> int | None:
    start_time = PARALLEL_DISPLAY_START_BY_DAY.get(day)
    if not start_time:
        return None
    return parse_time_minutes(start_time)


def is_schedule_metadata(text: str) -> bool:
    value = (text or "").strip()
    if not value:
        return True
    lowered = value.lower()
    if lowered in ("sessions", "talks"):
        return True
    if re.fullmatch(r"\d+", value):
        return True
    if re.fullmatch(r"PS\s+[\d.]+", value, flags=re.IGNORECASE):
        return True
    return False


def classify_agenda_kind(title: str, location: str) -> str:
    lowered = title.lower()
    if "keynote" in lowered:
        return "keynote"
    if "lightning" in lowered:
        return "lightning"
    if lowered.startswith("invited"):
        return "invited"
    if "poster" in lowered or "banquet" in lowered or "closing" in lowered:
        return "social"
    if "prize" in lowered:
        return "award"
    if "set-up" in lowered or "setup" in lowered:
        return "setup"
    if location and location.lower().startswith("inman"):
        return "parallel"
    return "session"


def link_session_id(sessions, day: str, code: str, title: str) -> str:
    title_key = re.sub(r"\s+", " ", title.strip().lower())
    for session in sessions:
        if session.get("day") != day:
            continue
        if code and session.get("code") == code:
            return session["id"]
        session_title = re.sub(r"\s+", " ", session.get("title", "").strip().lower())
        if session_title and session_title == title_key:
            return session["id"]
    return ""


def load_calendar_locations():
    if not SCHEDULE_CSV.exists():
        return []

    rows = list(csv.reader(SCHEDULE_CSV.read_text(encoding="utf-8").splitlines()))
    if not rows:
        return []

    locations = []
    for col_idx, header in enumerate(rows[0]):
        if col_idx < 2:
            continue
        location = clean_location(header)
        if not location:
            break
        locations.append(location)
    return locations


def load_schedule(sessions):
    if not SCHEDULE_CSV.exists():
        return [], {}

    rows = list(csv.reader(SCHEDULE_CSV.read_text(encoding="utf-8").splitlines()))
    if len(rows) < 3:
        return [], {}

    locations = []
    for col_idx, header in enumerate(rows[0]):
        if col_idx < 2:
            continue
        location = clean_location(header)
        if not location:
            break
        locations.append((col_idx, location))

    current_day = ""
    day_labels = {}
    parallel_codes = {}
    raw_slots = []

    for row in rows[2:]:
        if not row:
            continue
        day_cell = (row[0] or "").strip()
        if day_cell:
            parsed_day = normalize_schedule_day(day_cell)
            if parsed_day:
                current_day = parsed_day
                day_labels[parsed_day] = day_cell.strip().strip('"')
            else:
                current_day = current_day
        time_cell = extract_time_cell(row[1] if len(row) > 1 else "")
        if not current_day or not time_cell:
            continue

        parallel_code_row = True
        for col_idx, _ in locations:
            if col_idx < PARALLEL_ROOM_START_COL or col_idx >= len(row):
                continue
            cell = (row[col_idx] or "").strip()
            if cell and re.fullmatch(r"PS\s+[\d.]+", cell, flags=re.IGNORECASE):
                parallel_codes[col_idx] = cell.upper().replace("  ", " ")
            else:
                parallel_code_row = False
        if parallel_code_row and parallel_codes:
            continue

        main_location = locations[0][1] if locations else "Main program"
        if len(row) > 2:
            main_title = (row[2] or "").strip()
            if not is_schedule_metadata(main_title) and not is_setup_title(main_title):
                raw_slots.append(
                    {
                        "day": current_day,
                        "time": time_cell,
                        "location": main_location,
                        "title": main_title,
                        "code": "",
                    }
                )

        for col_idx, location in locations:
            if col_idx < PARALLEL_ROOM_START_COL or col_idx >= len(row):
                continue
            title = (row[col_idx] or "").strip()
            if is_schedule_metadata(title):
                continue
            parallel_start = parallel_display_start_minutes(current_day)
            if (
                parallel_start is not None
                and parse_time_minutes(time_cell) < parallel_start
            ):
                continue
            raw_slots.append(
                {
                    "day": current_day,
                    "time": time_cell,
                    "location": location,
                    "title": title,
                    "code": parallel_codes.get(col_idx, ""),
                }
            )

    raw_slots.sort(
        key=lambda slot: (
            slot["day"],
            parse_time_minutes(slot["time"]),
            slot["location"],
            slot["title"],
        )
    )

    merged = []
    for slot in raw_slots:
        if (
            merged
            and merged[-1]["day"] == slot["day"]
            and merged[-1]["location"] == slot["location"]
            and merged[-1]["title"] == slot["title"]
            and merged[-1]["code"] == slot["code"]
            and parse_time_minutes(slot["time"]) - parse_time_minutes(merged[-1]["endTime"])
            <= SLOT_MINUTES
        ):
            merged[-1]["endTime"] = slot["time"]
            continue
        merged.append(
            {
                "day": slot["day"],
                "startTime": slot["time"],
                "endTime": slot["time"],
                "location": slot["location"],
                "title": slot["title"],
                "code": slot["code"],
            }
        )

    agenda = []
    for idx, block in enumerate(merged):
        end_minutes = parse_time_minutes(block["endTime"]) + SLOT_MINUTES
        end_hour = end_minutes // 60
        end_minute = end_minutes % 60
        meridiem = "AM" if end_hour < 12 else "PM"
        display_hour = end_hour % 12 or 12
        end_time = f"{display_hour}:{end_minute:02d} {meridiem}"
        session_id = link_session_id(
            sessions, block["day"], block["code"], block["title"]
        )
        agenda.append(
            {
                "id": f"agenda-{idx + 1}",
                "day": block["day"],
                "startTime": block["startTime"],
                "endTime": end_time,
                "title": block["title"],
                "location": block["location"],
                "kind": classify_agenda_kind(block["title"], block["location"]),
                "sessionCode": block["code"],
                "sessionId": session_id,
            }
        )
    return agenda, day_labels


def sort_program_days(days):
    def day_key(day: str) -> tuple[int, str]:
        match = re.search(r"(\d+)", day or "")
        return (int(match.group(1)) if match else 0, day or "")

    return sorted({day for day in days if day}, key=day_key)


def build_program():
    parallel_rows = load_parallel_rows()
    sessions_by_key = {}
    talks = []

    for row in parallel_rows:
        key = (row["code"], row["sessionName"], row["day"])
        if key not in sessions_by_key:
            sid = session_id(row["code"], row["day"], row["sessionName"])
            sessions_by_key[key] = {
                "id": sid,
                "code": row["code"],
                "title": row["sessionName"],
                "day": row["day"],
                "startTime": row["time"],
                "endTime": row["time"],
                "topic": row["topic"],
                "talkIds": [],
            }
        session = sessions_by_key[key]
        session["talkIds"].append(row["id"])
        if parse_time_minutes(row["time"]) < parse_time_minutes(session["startTime"]):
            session["startTime"] = row["time"]
        if parse_time_minutes(row["time"]) >= parse_time_minutes(session["endTime"]):
            session["endTime"] = row["time"]
        if row["topic"] and not session.get("topic"):
            session["topic"] = row["topic"]
        talks.append(
            {
                "id": row["id"],
                "sessionId": session["id"],
                "startTime": row["time"],
                "title": row["title"],
                "authors": row["authors"],
                "abstract": row["abstract"],
                "speaker": row["speaker"],
                "topic": row["topic"],
                "day": row["day"],
                "sessionCode": row["code"],
                "sessionTitle": row["sessionName"],
            }
        )

    sessions = list(sessions_by_key.values())
    for session in sessions:
        session["talkIds"].sort(
            key=lambda tid: parse_time_minutes(
                next(t["startTime"] for t in talks if t["id"] == tid)
            )
        )
        session["label"] = (
            f"{session['code']} — {session['title']}" if session["code"] else session["title"]
        )

    sessions.sort(
        key=lambda s: (
            s["day"],
            parse_time_minutes(s["startTime"]),
            s["code"],
            s["title"],
        )
    )

    group_order = []
    seen_groups = set()
    for session in sessions:
        group = session_color_group(session["title"])
        if group not in seen_groups:
            seen_groups.add(group)
            group_order.append(group)
    group_color = {g: PALETTE[i % len(PALETTE)] for i, g in enumerate(group_order)}
    for session in sessions:
        session["color"] = group_color[session_color_group(session["title"])]

    agenda, day_labels = load_schedule(sessions)
    agenda_by_day = {}
    for item in agenda:
        agenda_by_day.setdefault(item["day"], []).append(item)

    day_candidates = []
    if agenda_by_day:
        day_candidates.extend(agenda_by_day.keys())
    else:
        day_candidates.extend(session["day"] for session in sessions if session["day"])

    lightning_rows = load_lightning_rows()
    lightning_sessions, lightning_talks = build_lightning_program(lightning_rows)
    for lt in lightning_talks:
        if lt.get("day"):
            day_candidates.append(lt["day"])
    days = sort_program_days(day_candidates)

    posters = read_filtered_posters(POSTERS_CSV) if POSTERS_CSV.is_file() else []

    def poster_sort_key(p):
        d = p.get("day") or ""
        m = re.search(r"(\d+)", d)
        dk = int(m.group(1)) if m else 0
        return (dk, d, parse_time_minutes(p.get("time")), p.get("posterNumber") or "", p.get("title") or "")

    posters.sort(key=poster_sort_key)

    return {
        "meta": {
            "title": "NetSci 2026 Program",
            "timezoneNote": "Times shown in conference local time",
            "builtAt": datetime.now(timezone.utc).isoformat(),
        },
        "days": days,
        "dayLabels": day_labels,
        "calendarLocations": load_calendar_locations(),
        "sessions": sessions,
        "talks": talks,
        "lightningSessions": lightning_sessions,
        "lightningTalks": lightning_talks,
        "posters": posters,
        "agenda": agenda,
        "agendaByDay": agenda_by_day,
    }


def main():
    program = build_program()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(program, f, ensure_ascii=False)
    print(f"Wrote {OUT_PATH}")
    pre = Path(__file__).resolve().parent / "preprocess_lightning.py"
    if pre.is_file():
        r = subprocess.run([sys.executable, str(pre), "0.55"], cwd=APP_ROOT)
        if r.returncode != 0:
            print("Warning: preprocess_lightning.py exited with", r.returncode)
    print(
        f"  {len(program['days'])} days, {len(program['sessions'])} sessions, "
        f"{len(program['talks'])} talks, "
        f"{len(program.get('lightningSessions', []))} lightning sessions, "
        f"{len(program.get('lightningTalks', []))} lightning talks, "
        f"{len(program.get('posters', []))} posters, "
        f"{len(program.get('agenda', []))} agenda blocks"
    )


if __name__ == "__main__":
    main()
