#!/usr/bin/env python3
"""
Parallel session talks (catalog CSV): sentence-transformer embeddings on title +
abstract, cosine similarity, and `talk_metadata.json` for `preprocess_sessions.py`.

Final session assignments live only in the catalog CSV; this script does not
re-cluster talks into new sessions.
"""

import csv
import json

import numpy as np

import build_program as bp  # noqa: E402

INTERMEDIATE_DIR = bp.INTERMEDIATE_DIR
INTERMEDIATE_DIR.mkdir(parents=True, exist_ok=True)

# ── 1. Load parallel-track talks from final sessions CSV ─────────────────────
SESSION_CSV = bp.SESSION_CSV
print(f"Loading parallel session talks from {SESSION_CSV.name}...")
if not SESSION_CSV.is_file():
    raise SystemExit(f"Missing sessions CSV: {SESSION_CSV}")

rows = bp.load_parallel_rows()
seen: set[str] = set()
talks = []
for row in rows:
    pid = str(row["id"]).strip()
    if not pid or pid in seen:
        continue
    seen.add(pid)
    talks.append(
        {
            "id": pid,
            "title": (row.get("title") or "").strip(),
            "abstract": (row.get("abstract") or "").strip(),
            "authors": (row.get("authors") or "").strip(),
        }
    )

print(f"Found {len(talks)} talks (non-dropped rows with numeric submission and assigned session)")
if not talks:
    raise SystemExit("No talks to embed; check the sessions CSV filters and content.")

# ── 2. Compute embeddings ─────────────────────────────────────────────────────
print("\nLoading sentence-transformer model (all-MiniLM-L6-v2)...")
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")


def talk_to_embedding_text(t: dict) -> str:
    """Single string passed to the encoder: title then abstract (both required for quality)."""
    title = (t.get("title") or "").strip()
    abstract = (t.get("abstract") or "").strip()
    if title and abstract:
        return f"{title}\n\n{abstract}"
    return title or abstract


texts = [talk_to_embedding_text(t) for t in talks]
print(f"Computing embeddings for {len(texts)} talks (title + abstract)...")
embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

# ── 3. Cosine similarity matrix ──────────────────────────────────────────────
print("Computing cosine similarity matrix...")
cos_sim = embeddings @ embeddings.T

np.save(INTERMEDIATE_DIR / "cosine_similarity_matrix.npy", cos_sim)
talk_ids = [t["id"] for t in talks]
with open(INTERMEDIATE_DIR / "talk_ids.json", "w", encoding="utf-8") as f:
    json.dump(talk_ids, f)

with open(INTERMEDIATE_DIR / "cosine_similarity_matrix.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow([""] + talk_ids)
    for i, tid in enumerate(talk_ids):
        writer.writerow([tid] + [f"{cos_sim[i, j]:.4f}" for j in range(len(talk_ids))])

triu = np.triu_indices_from(cos_sim, k=1)
print(f"Similarity matrix saved: {cos_sim.shape}")
if triu[0].size:
    print(f"  Mean similarity: {cos_sim[triu].mean():.4f}")
    print(f"  Std similarity:  {cos_sim[triu].std():.4f}")
    print(f"  Min similarity:  {cos_sim[triu].min():.4f}")
    print(f"  Max similarity:  {cos_sim[triu].max():.4f}")

# ── 4. Talk metadata for graph build (catalog remains source of truth for sessions) ─
meta_path = INTERMEDIATE_DIR / "talk_metadata.json"
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(talks, f, ensure_ascii=False, indent=2)
print(f"Talk metadata saved to: {meta_path.name}")

np.save(INTERMEDIATE_DIR / "talk_embeddings.npy", embeddings)
print("Embeddings saved to: talk_embeddings.npy")
