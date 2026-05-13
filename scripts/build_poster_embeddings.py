#!/usr/bin/env python3
"""
Embed NetSci 2026 posters (title + abstract) with sentence-transformers.
Only rows where "Show in the program" is YES (and day is not DROPPED OUT).

Writes under `network-app/data/intermediate/`:
  - poster_embeddings.npy
  - poster_cosine_similarity_matrix.npy
  - poster_cosine_similarity_matrix.csv
  - poster_ids.json
  - poster_metadata.json  (same order as ids; consumed by preprocess_posters.py)
"""

import csv
import json

import numpy as np

from build_program import INTERMEDIATE_DIR, POSTERS_CSV
from poster_csv import read_filtered_posters

OUT_DIR = INTERMEDIATE_DIR


def poster_to_embedding_text(p: dict) -> str:
    title = (p.get("title") or "").strip()
    abstract = (p.get("abstract") or "").strip()
    if title and abstract:
        return f"{title}\n\n{abstract}"
    return title or abstract


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not POSTERS_CSV.is_file():
        raise SystemExit(f"Missing poster CSV: {POSTERS_CSV}")

    posters = read_filtered_posters(POSTERS_CSV)
    print(f"Posters with Show in program = YES (non-dropped): {len(posters)}")

    meta_path = OUT_DIR / "poster_metadata.json"
    if not posters:
        np.save(OUT_DIR / "poster_embeddings.npy", np.zeros((0, 384), dtype=np.float32))
        np.save(OUT_DIR / "poster_cosine_similarity_matrix.npy", np.zeros((0, 0), dtype=np.float32))
        (OUT_DIR / "poster_cosine_similarity_matrix.csv").write_text("", encoding="utf-8")
        (OUT_DIR / "poster_ids.json").write_text("[]", encoding="utf-8")
        meta_path.write_text("[]", encoding="utf-8")
        print("Wrote empty poster artifacts.")
        return

    from sentence_transformers import SentenceTransformer

    print("Loading sentence-transformer model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts = [poster_to_embedding_text(p) for p in posters]
    print(f"Computing embeddings for {len(texts)} posters...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    cos_sim = embeddings @ embeddings.T
    poster_ids = [p["id"] for p in posters]

    np.save(OUT_DIR / "poster_embeddings.npy", embeddings)
    np.save(OUT_DIR / "poster_cosine_similarity_matrix.npy", cos_sim)
    with open(OUT_DIR / "poster_ids.json", "w", encoding="utf-8") as f:
        json.dump(poster_ids, f)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(posters, f, ensure_ascii=False)

    csv_path = OUT_DIR / "poster_cosine_similarity_matrix.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([""] + poster_ids)
        for i, pid in enumerate(poster_ids):
            w.writerow([pid] + [f"{cos_sim[i, j]:.6f}" for j in range(len(poster_ids))])

    triu = np.triu_indices_from(cos_sim, k=1)
    if triu[0].size:
        print(
            f"Cosine similarity (off-diagonal): mean={cos_sim[triu].mean():.4f} "
            f"std={cos_sim[triu].std():.4f} min={cos_sim[triu].min():.4f} max={cos_sim[triu].max():.4f}"
        )
    print(
        "Wrote poster_embeddings.npy, poster_cosine_similarity_matrix.npy/.csv, "
        "poster_ids.json, poster_metadata.json"
    )


if __name__ == "__main__":
    main()
