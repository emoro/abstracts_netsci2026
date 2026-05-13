#!/usr/bin/env python3
"""
Build public/sessions_graph_data.json from:
  - data/catalog/… FINAL Netsci 2026 Sessions.csv (session assignments — source of truth)
  - data/intermediate/cosine_similarity_matrix.csv (embedding cosine similarities)
  - data/intermediate/talk_metadata.json (title, authors, abstract; optional if CSV has text)
"""

import csv
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from collections import deque

import build_program as bp

THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.55
APP_ROOT = Path(__file__).resolve().parent.parent
INTERMEDIATE_DIR = bp.INTERMEDIATE_DIR
PUBLIC_DIR = APP_ROOT / "public"

# Edge score: blend embedding cosine similarity with same-session indicator (0/1).
# Cross-session pairs need sim >= THRESHOLD (same as before), since session term is 0.
EDGE_EMBEDDING_WEIGHT = 0.5
EDGE_SESSION_WEIGHT = 0.5


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
    """e.g. 'Network Models 1' / 'Network Models 2' → 'Network Models' (one color)."""
    s = label.strip()
    s = re.sub(r"^S\d+\s*[—-]\s*", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"^PS\s*\d+(?:\.\d+)?\s*[—-]\s*", "", s, flags=re.IGNORECASE).strip()
    # Trailing parallel slot 1–100 only (avoid stripping years like … 2024)
    s = re.sub(r"\s+(?:[1-9]\d?|100)\s*$", "", s).strip()
    return s or label.strip()


# ── 1. Parse final sessions CSV ─────────────────────────────────────────────
session_csv = bp.SESSION_CSV
print(f"Parsing {session_csv.name}...")
raw_lines = session_csv.read_text(encoding="utf-8").splitlines()
header_idx = next(
    i for i, line in enumerate(raw_lines) if line.strip().startswith("Submission #")
)
reader = csv.DictReader(io.StringIO("\n".join(raw_lines[header_idx:])))
lookup = header_lookup(reader.fieldnames or [])

session_map = {}  # paper_id -> session_label
session_order = []  # ordered list of unique session labels
talk_details = {}  # paper_id -> title/authors/abstract from CSV

for row in reader:
    if is_dropped(row_value(row, lookup, ["Dropped"])):
        continue
    paper_id = row_value(row, lookup, ["Submission #", "Submission ID"])
    if not paper_id.isdigit():
        continue
    session_name = row_value(row, lookup, ["Assigned Session"])
    session_number = row_value(row, lookup, ["Session #", "Session\xa0#"])
    if not session_name:
        continue
    session_label = (
        f"{session_number} — {session_name}" if session_number else session_name
    )
    session_map[paper_id] = session_label
    if session_label not in session_order:
        session_order.append(session_label)
    talk_details[paper_id] = {
        "title": row_value(row, lookup, ["Title", "Paper Title"]),
        "authors": row_value(row, lookup, ["Authors", "Author Name"]),
        "abstract": row_value(row, lookup, ["Abstract"]),
        "day": row_value(row, lookup, ["Day"]),
        "time": row_value(row, lookup, ["Time"]),
        "primarySpeaker": row_value(
            row,
            lookup,
            ["Primary speaker", "Primary contact", "Primary Contact Author Name"],
        ),
    }

print(f"  Found {len(session_map)} talks in {len(session_order)} sessions")

# ── 2. Load talk metadata (from embedding step; fallback for older runs) ─────
_meta_paths = [
    INTERMEDIATE_DIR / "talk_metadata.json",
    INTERMEDIATE_DIR / "talk_metadata_with_clusters.json",
]
meta_path = next((p for p in _meta_paths if p.is_file()), None)
if not meta_path:
    raise SystemExit(
        "Missing talk metadata. Run scripts/build_sessions_embeddings.py first "
        f"(expected one of: {[p.name for p in _meta_paths]})"
    )
print(f"  Loading talk metadata from {meta_path.name}...")
with meta_path.open(encoding="utf-8") as f:
    all_talks = json.load(f)

# Index by ID
talk_by_id = {t["id"]: t for t in all_talks}

# Keep scheduled talks with metadata and/or CSV text fields
talk_ids = []
for pid in session_map:
    csv_talk = talk_details.get(pid, {})
    if pid in talk_by_id or csv_talk.get("title"):
        talk_ids.append(pid)
print(
    f"  Matched {len(talk_ids)} talks "
    f"({sum(1 for pid in talk_ids if pid in talk_by_id)} in metadata)"
)

# ── 3. Load embedding similarity matrix ──────────────────────────────────────
print("Loading cosine similarity matrix...")
with (INTERMEDIATE_DIR / "cosine_similarity_matrix.csv").open(encoding="utf-8") as f:
    reader = csv.reader(f)
    header = next(reader)
    csv_ids = header[1:]
    sim_matrix = {}
    for row in reader:
        rid = row[0]
        sim_matrix[rid] = {csv_ids[j]: float(row[j + 1]) for j in range(len(csv_ids))}

# ── 4. Build edges ───────────────────────────────────────────────────────────
min_combined = EDGE_EMBEDDING_WEIGHT * THRESHOLD
print(
    f"Building edges (score = {EDGE_EMBEDDING_WEIGHT:.0%} embedding + "
    f"{EDGE_SESSION_WEIGHT:.0%} same-session; keep if score >= {min_combined:.4f})..."
)
edges = []
for i, a in enumerate(talk_ids):
    for j in range(i + 1, len(talk_ids)):
        b = talk_ids[j]
        if a in sim_matrix and b in sim_matrix.get(a, {}):
            sim = sim_matrix[a][b]
        elif b in sim_matrix and a in sim_matrix.get(b, {}):
            sim = sim_matrix[b][a]
        else:
            continue
        same_session = 1.0 if session_map.get(a) == session_map.get(b) else 0.0
        combined = EDGE_EMBEDDING_WEIGHT * sim + EDGE_SESSION_WEIGHT * same_session
        if combined >= min_combined:
            edges.append(
                {
                    "source": a,
                    "target": b,
                    "value": round(combined, 4),
                    "embeddingSim": round(sim, 4),
                }
            )

print(f"  {len(edges)} edges (avg degree {2*len(edges)/len(talk_ids):.1f})")

# ── 5. Ensure connected graph ────────────────────────────────────────────────
print("Ensuring single connected component...")
adj = {tid: set() for tid in talk_ids}
for e in edges:
    adj[e["source"]].add(e["target"])
    adj[e["target"]].add(e["source"])

# BFS to find components
visited = set()
components = []
for start in talk_ids:
    if start in visited:
        continue
    comp = set()
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if node in comp:
            continue
        comp.add(node)
        visited.add(node)
        for nb in adj[node]:
            if nb not in comp:
                queue.append(nb)
    components.append(comp)

if len(components) > 1:
    components.sort(key=len, reverse=True)
    main_comp = components[0]
    bridge_count = 0
    for comp in components[1:]:
        # Find best bridge edge (by blended score)
        best_sim = -1.0
        best_pair = None
        best_emb = 0.0
        for a in comp:
            for b in main_comp:
                s = sim_matrix.get(a, {}).get(b, sim_matrix.get(b, {}).get(a, 0))
                same_session = (
                    1.0 if session_map.get(a) == session_map.get(b) else 0.0
                )
                combined = EDGE_EMBEDDING_WEIGHT * s + EDGE_SESSION_WEIGHT * same_session
                if combined > best_sim:
                    best_sim = combined
                    best_pair = (a, b)
                    best_emb = s
        if best_pair:
            edges.append(
                {
                    "source": best_pair[0],
                    "target": best_pair[1],
                    "value": round(best_sim, 4),
                    "embeddingSim": round(best_emb, 4),
                }
            )
            main_comp.update(comp)
            bridge_count += 1
    print(f"  Added {bridge_count} bridge edges")

# ── 6. Compute session coherence ─────────────────────────────────────────────
print("Computing session coherence...")
coherence = {}
for session in session_order:
    members = [pid for pid in talk_ids if session_map.get(pid) == session]
    if len(members) < 2:
        coherence[session] = 1.0
        continue
    sims = []
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            a, b = members[i], members[j]
            s = sim_matrix.get(a, {}).get(b, sim_matrix.get(b, {}).get(a, 0))
            sims.append(s)
    coherence[session] = round(float(np.mean(sims)), 4) if sims else 0

mean_coh = np.mean(list(coherence.values()))
print(f"  Mean coherence: {mean_coh:.4f}")

# ── 7. Color palette ─────────────────────────────────────────────────────────
PALETTE = [
    "#C8352E", "#2E86C1", "#28B463", "#F39C12", "#8E44AD",
    "#E74C3C", "#1ABC9C", "#D4AC0D", "#5B2C6F", "#117A65",
    "#CA6F1E", "#2874A6", "#D35400", "#1A5276", "#7D3C98",
    "#239B56", "#B03A2E", "#148F77", "#6C3483", "#D68910",
    "#1F618D", "#CB4335", "#0E6655", "#AF601A", "#2C3E50",
    "#A93226", "#1B4F72", "#196F3D", "#7E5109", "#4A235A",
    "#0B5345", "#784212", "#154360", "#7B241C", "#0A3D62",
    "#1E8449", "#B7950B", "#6E2C00", "#4A148C", "#004D40",
]

group_order = []
seen_groups = set()
for s in session_order:
    g = session_color_group(s)
    if g not in seen_groups:
        seen_groups.add(g)
        group_order.append(g)

group_color = {g: PALETTE[i % len(PALETTE)] for i, g in enumerate(group_order)}
colors = {s: group_color[session_color_group(s)] for s in session_order}

# ── 8. Build nodes ───────────────────────────────────────────────────────────
nodes = []
for pid in talk_ids:
    t = talk_by_id.get(pid, {})
    csv_talk = talk_details.get(pid, {})
    node = {
        "id": pid,
        "title": csv_talk.get("title") or t.get("title", ""),
        "authors": csv_talk.get("authors") or t.get("authors", ""),
        "abstract": csv_talk.get("abstract") or t.get("abstract", ""),
        "session": session_map[pid],
    }
    if csv_talk.get("day"):
        node["day"] = csv_talk["day"]
    if csv_talk.get("time"):
        node["time"] = csv_talk["time"]
    if csv_talk.get("primarySpeaker"):
        node["primarySpeaker"] = csv_talk["primarySpeaker"]
    nodes.append(node)

# ── 9. Write output ──────────────────────────────────────────────────────────
out = {
    "nodes": nodes,
    "links": edges,
    "colors": colors,
    "threshold": THRESHOLD,
    "edgeBlend": {
        "embeddingWeight": EDGE_EMBEDDING_WEIGHT,
        "sessionWeight": EDGE_SESSION_WEIGHT,
        "minCombinedScore": round(min_combined, 4),
    },
    "sessionCoherence": coherence,
    "sessionOrder": session_order,
}

outpath = PUBLIC_DIR / "sessions_graph_data.json"
with outpath.open("w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

print(f"\nNodes: {len(nodes)}")
print(
    f"Edges: {len(edges)} (blended score >= {min_combined:.4f}; "
    f"embedding-only bar {THRESHOLD})"
)
print(f"Sessions: {len(session_order)}")
print(f"Written to {outpath}")
