#!/usr/bin/env python3
"""
Embed NetSci 2026 lightning talks (title + abstract) with sentence-transformers.

Reads the same lightning CSV as build_program.py (non-dropped rows only).

Writes under `network-app/data/intermediate/`:
  - lightning_embeddings.npy
  - lightning_cosine_similarity_matrix.npy
  - lightning_cosine_similarity_matrix.csv
  - lightning_ids.json
  - lightning_metadata.json  (same order as ids, for preprocess_lightning.py)
"""

import csv
import json
import sys

import numpy as np

import build_program as bp  # noqa: E402

OUT_DIR = bp.INTERMEDIATE_DIR


def talk_to_embedding_text(t: dict) -> str:
    title = (t.get("title") or "").strip()
    abstract = (t.get("abstract") or "").strip()
    if title and abstract:
        return f"{title}\n\n{abstract}"
    return title or abstract


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = bp.load_lightning_rows()
    _, talks = bp.build_lightning_program(rows)
    print(f"Lightning talks (non-dropped): {len(talks)}")

    meta_path = OUT_DIR / "lightning_metadata.json"
    if not talks:
        np.save(OUT_DIR / "lightning_embeddings.npy", np.zeros((0, 384), dtype=np.float32))
        np.save(OUT_DIR / "lightning_cosine_similarity_matrix.npy", np.zeros((0, 0), dtype=np.float32))
        (OUT_DIR / "lightning_cosine_similarity_matrix.csv").write_text("", encoding="utf-8")
        (OUT_DIR / "lightning_ids.json").write_text("[]", encoding="utf-8")
        meta_path.write_text("[]", encoding="utf-8")
        print("Wrote empty lightning embedding artifacts.")
        return

    from sentence_transformers import SentenceTransformer

    print("Loading sentence-transformer model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts = [talk_to_embedding_text(t) for t in talks]
    print(f"Computing embeddings for {len(texts)} lightning talks...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    cos_sim = embeddings @ embeddings.T
    ids = [t["id"] for t in talks]

    np.save(OUT_DIR / "lightning_embeddings.npy", embeddings)
    np.save(OUT_DIR / "lightning_cosine_similarity_matrix.npy", cos_sim)
    with open(OUT_DIR / "lightning_ids.json", "w", encoding="utf-8") as f:
        json.dump(ids, f)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(talks, f, ensure_ascii=False)

    csv_path = OUT_DIR / "lightning_cosine_similarity_matrix.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([""] + ids)
        for i, tid in enumerate(ids):
            w.writerow([tid] + [f"{cos_sim[i, j]:.6f}" for j in range(len(ids))])

    triu = np.triu_indices_from(cos_sim, k=1)
    if triu[0].size:
        print(
            f"Cosine similarity (off-diagonal): mean={cos_sim[triu].mean():.4f} "
            f"std={cos_sim[triu].std():.4f} min={cos_sim[triu].min():.4f} max={cos_sim[triu].max():.4f}"
        )
    print(
        "Wrote lightning_embeddings.npy, lightning_cosine_similarity_matrix.npy/.csv, "
        "lightning_ids.json, lightning_metadata.json"
    )


if __name__ == "__main__":
    main()
