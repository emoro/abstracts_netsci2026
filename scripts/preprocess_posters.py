#!/usr/bin/env python3
"""
Build network-app/public/poster_graph_data.json from poster cosine similarity.
No session term: edges when cosine similarity >= THRESHOLD (default 0.55).
Bridges disconnected components like preprocess_sessions.py (embedding-only).
"""

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np

import build_program as bp

THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.55
APP_ROOT = Path(__file__).resolve().parent.parent
INTERMEDIATE_DIR = bp.INTERMEDIATE_DIR
PUBLIC_DIR = APP_ROOT / "public"

PALETTE = [
    "#C8352E", "#2E86C1", "#28B463", "#F39C12", "#8E44AD",
    "#E74C3C", "#1ABC9C", "#D4AC0D", "#5B2C6F", "#117A65",
]


def main():
    npy_path = INTERMEDIATE_DIR / "poster_cosine_similarity_matrix.npy"
    ids_path = INTERMEDIATE_DIR / "poster_ids.json"
    meta_path = INTERMEDIATE_DIR / "poster_metadata.json"
    outpath = PUBLIC_DIR / "poster_graph_data.json"
    outpath.parent.mkdir(parents=True, exist_ok=True)

    if not npy_path.is_file() or not ids_path.is_file():
        print("Missing poster_embeddings run; writing empty poster_graph_data.json")
        out = {"nodes": [], "links": [], "colors": {}, "threshold": THRESHOLD, "sessionOrder": []}
        outpath.write_text(json.dumps(out), encoding="utf-8")
        return

    cos_sim = np.load(npy_path)
    with open(ids_path, encoding="utf-8") as f:
        poster_ids = json.load(f)

    n = len(poster_ids)
    if n == 0 or cos_sim.shape != (n, n):
        out = {"nodes": [], "links": [], "colors": {}, "threshold": THRESHOLD, "sessionOrder": []}
        outpath.write_text(json.dumps(out), encoding="utf-8")
        print("Empty poster graph written.")
        return

    sim_matrix = {}
    for i, a in enumerate(poster_ids):
        sim_matrix[a] = {poster_ids[j]: float(cos_sim[i, j]) for j in range(n)}

    poster_meta = {}
    if meta_path.is_file():
        try:
            plist = json.loads(meta_path.read_text(encoding="utf-8"))
            for p in plist:
                poster_meta[str(p.get("id"))] = p
        except json.JSONDecodeError:
            pass

    # Color by poster type (session field for the graph UI)
    session_order = []
    seen_types = set()
    for pid in poster_ids:
        p = poster_meta.get(pid, {})
        t = (p.get("posterType") or "Poster").strip() or "Poster"
        if t not in seen_types:
            seen_types.add(t)
            session_order.append(t)
    colors = {t: PALETTE[i % len(PALETTE)] for i, t in enumerate(session_order)}

    nodes = []
    for pid in poster_ids:
        p = poster_meta.get(pid, {})
        ptype = (p.get("posterType") or "Poster").strip() or "Poster"
        nodes.append(
            {
                "id": pid,
                "title": p.get("title", ""),
                "authors": p.get("authors", ""),
                "abstract": (p.get("abstract") or "")[:4000],
                "session": ptype,
                "day": p.get("day"),
                "time": p.get("time"),
                "primarySpeaker": p.get("speaker") or "",
            }
        )

    edges = []
    for i, a in enumerate(poster_ids):
        for j in range(i + 1, n):
            b = poster_ids[j]
            sim = sim_matrix[a][b]
            if sim >= THRESHOLD:
                edges.append(
                    {
                        "source": a,
                        "target": b,
                        "value": round(sim, 4),
                        "embeddingSim": round(sim, 4),
                    }
                )

    print(f"Poster edges before bridging: {len(edges)}")

    adj = {tid: set() for tid in poster_ids}
    for e in edges:
        adj[e["source"]].add(e["target"])
        adj[e["target"]].add(e["source"])

    visited = set()
    components = []
    for start in poster_ids:
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
            best_sim = -1.0
            best_pair = None
            for a in comp:
                for b in main_comp:
                    s = sim_matrix[a][b]
                    if s > best_sim:
                        best_sim = s
                        best_pair = (a, b)
            if best_pair and best_sim >= 0:
                edges.append(
                    {
                        "source": best_pair[0],
                        "target": best_pair[1],
                        "value": round(max(best_sim, 0.01), 4),
                        "embeddingSim": round(best_sim, 4),
                    }
                )
                main_comp.update(comp)
                bridge_count += 1
        print(f"  Added {bridge_count} bridge edges")

    out = {
        "nodes": nodes,
        "links": edges,
        "colors": colors,
        "threshold": THRESHOLD,
        "sessionOrder": session_order,
        "edgeBlend": {"embeddingWeight": 1.0, "sessionWeight": 0.0, "posterOnly": True},
    }
    outpath.write_text(json.dumps(out), encoding="utf-8")
    print(f"Wrote {outpath} ({len(nodes)} nodes, {len(edges)} edges)")


if __name__ == "__main__":
    main()
