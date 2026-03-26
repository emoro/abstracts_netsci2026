#!/usr/bin/env python3
"""
Build graph_data.json from:
  - NetSci2026_final_sessions.md  (session assignments — source of truth)
  - cosine_similarity_matrix.csv  (embedding similarities)
  - talk_metadata_with_clusters.json (title, authors, abstract)
"""

import csv
import json
import re
import sys
import numpy as np
from collections import deque

THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.55
BASE = "/Users/emoro/MyDocuments/Netsci 2026/final_program"

# ── 1. Parse final sessions markdown ─────────────────────────────────────────
print("Parsing NetSci2026_final_sessions.md...")
md_text = open(f"{BASE}/NetSci2026_final_sessions.md").read()

session_map = {}  # paper_id -> session_label
session_order = []  # ordered list of unique session labels

for m in re.finditer(
    r'^## S\d+\s*[—-]\s*(.+?)$',
    md_text,
    re.MULTILINE,
):
    session_label = m.group(1).strip()
    if session_label not in session_order:
        session_order.append(session_label)

    # Find all submission IDs in this session's block
    start = m.end()
    next_header = re.search(r'\n## S\d+', md_text[start:])
    end = start + next_header.start() if next_header else len(md_text)
    block = md_text[start:end]

    for sub_m in re.finditer(r'Submission #:\s*(\d+)', block):
        paper_id = sub_m.group(1)
        session_map[paper_id] = session_label

print(f"  Found {len(session_map)} talks in {len(session_order)} sessions")

# ── 2. Load talk metadata ────────────────────────────────────────────────────
with open(f"{BASE}/talk_metadata_with_clusters.json") as f:
    all_talks = json.load(f)

# Index by ID
talk_by_id = {t["id"]: t for t in all_talks}

# Only keep talks that appear in the final sessions
talk_ids = [pid for pid in session_map if pid in talk_by_id]
print(f"  Matched {len(talk_ids)} talks to metadata")

# ── 3. Load embedding similarity matrix ──────────────────────────────────────
print("Loading cosine similarity matrix...")
with open(f"{BASE}/cosine_similarity_matrix.csv") as f:
    reader = csv.reader(f)
    header = next(reader)
    csv_ids = header[1:]
    sim_matrix = {}
    for row in reader:
        rid = row[0]
        sim_matrix[rid] = {csv_ids[j]: float(row[j + 1]) for j in range(len(csv_ids))}

# ── 4. Build edges ───────────────────────────────────────────────────────────
print(f"Building edges (threshold >= {THRESHOLD})...")
edges = []
id_set = set(talk_ids)
for i, a in enumerate(talk_ids):
    for j in range(i + 1, len(talk_ids)):
        b = talk_ids[j]
        if a in sim_matrix and b in sim_matrix.get(a, {}):
            sim = sim_matrix[a][b]
        elif b in sim_matrix and a in sim_matrix.get(b, {}):
            sim = sim_matrix[b][a]
        else:
            continue
        if sim >= THRESHOLD:
            edges.append({"source": a, "target": b, "value": round(sim, 4)})

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
        # Find best bridge edge
        best_sim = -1
        best_pair = None
        for a in comp:
            for b in main_comp:
                s = sim_matrix.get(a, {}).get(b, sim_matrix.get(b, {}).get(a, 0))
                if s > best_sim:
                    best_sim = s
                    best_pair = (a, b)
        if best_pair:
            edges.append({"source": best_pair[0], "target": best_pair[1],
                          "value": round(best_sim, 4)})
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

colors = {}
for i, session in enumerate(session_order):
    colors[session] = PALETTE[i % len(PALETTE)]

# ── 8. Build nodes ───────────────────────────────────────────────────────────
nodes = []
for pid in talk_ids:
    t = talk_by_id[pid]
    nodes.append({
        "id": pid,
        "title": t.get("title", ""),
        "authors": t.get("authors", ""),
        "abstract": t.get("abstract", ""),
        "session": session_map[pid],
    })

# ── 9. Write output ──────────────────────────────────────────────────────────
out = {
    "nodes": nodes,
    "links": edges,
    "colors": colors,
    "threshold": THRESHOLD,
    "sessionCoherence": coherence,
    "sessionOrder": session_order,
}

outpath = f"{BASE}/network-app/public/graph_data.json"
with open(outpath, "w") as f:
    json.dump(out, f)

print(f"\nNodes: {len(nodes)}")
print(f"Edges: {len(edges)} (threshold >= {THRESHOLD})")
print(f"Sessions: {len(session_order)}")
print(f"Written to {outpath}")
