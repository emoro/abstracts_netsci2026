#!/usr/bin/env python3
"""
Build public/lightning_graph_data.json from lightning talk cosine similarity.
Embedding-only edges: cosine similarity >= THRESHOLD (default 0.55).
Bridges disconnected components like preprocess_posters.py (no session-based links).
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

OUT_PATH = PUBLIC_DIR / "lightning_graph_data.json"


def main():
    npy_path = INTERMEDIATE_DIR / "lightning_cosine_similarity_matrix.npy"
    ids_path = INTERMEDIATE_DIR / "lightning_ids.json"
    meta_path = INTERMEDIATE_DIR / "lightning_metadata.json"

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not npy_path.is_file() or not ids_path.is_file():
        print("Missing lightning embeddings run; writing empty lightning_graph_data.json")
        out = {
            "nodes": [],
            "links": [],
            "colors": {},
            "threshold": THRESHOLD,
            "sessionOrder": [],
            "edgeBlend": {"embeddingWeight": 1.0, "sessionWeight": 0.0, "lightningOnly": True},
        }
        OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
        return

    cos_sim = np.load(npy_path)
    with open(ids_path, encoding="utf-8") as f:
        talk_ids = json.load(f)

    n = len(talk_ids)
    if n == 0 or cos_sim.shape != (n, n):
        out = {
            "nodes": [],
            "links": [],
            "colors": {},
            "threshold": THRESHOLD,
            "sessionOrder": [],
            "edgeBlend": {"embeddingWeight": 1.0, "sessionWeight": 0.0, "lightningOnly": True},
        }
        OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
        print("Empty lightning graph written.")
        return

    sim_matrix = {}
    for i, a in enumerate(talk_ids):
        sim_matrix[a] = {talk_ids[j]: float(cos_sim[i, j]) for j in range(n)}

    talk_meta = {}
    if meta_path.is_file():
        try:
            tlist = json.loads(meta_path.read_text(encoding="utf-8"))
            for t in tlist:
                talk_meta[str(t.get("id"))] = t
        except json.JSONDecodeError:
            pass

    # Node color by scheduled session (Lighting 1 / 2); edges are embedding-only.
    session_order = []
    seen_sessions = set()
    for tid in talk_ids:
        t = talk_meta.get(tid, {})
        lab = (t.get("sessionTitle") or "").strip() or "Lightning"
        if lab not in seen_sessions:
            seen_sessions.add(lab)
            session_order.append(lab)
    colors = {lab: PALETTE[i % len(PALETTE)] for i, lab in enumerate(session_order)}

    nodes = []
    for tid in talk_ids:
        t = talk_meta.get(tid, {})
        session_label = (t.get("sessionTitle") or "").strip() or "Lightning"
        nodes.append(
            {
                "id": tid,
                "title": t.get("title", ""),
                "authors": t.get("authors", ""),
                "abstract": (t.get("abstract") or "")[:4000],
                "session": session_label,
                "day": t.get("day"),
                "time": t.get("startTime"),
                "primarySpeaker": t.get("speaker") or "",
            }
        )

    edges = []
    for i, a in enumerate(talk_ids):
        for j in range(i + 1, n):
            b = talk_ids[j]
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

    print(f"Lightning edges before bridging: {len(edges)}")

    adj = {tid: set() for tid in talk_ids}
    for e in edges:
        adj[e["source"]].add(e["target"])
        adj[e["target"]].add(e["source"])

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
        "edgeBlend": {"embeddingWeight": 1.0, "sessionWeight": 0.0, "lightningOnly": True},
    }
    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(nodes)} nodes, {len(edges)} edges)")


if __name__ == "__main__":
    main()
