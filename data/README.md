# Data layout under `network-app/data/`

Rebuild scripts use two subfolders so **organizer lists** stay separate from **generated embedding artifacts**.

## `data/catalog/` — talks, sessions, schedule

Place these files here (exact names):

| File | Role |
|------|------|
| `NetSci2026_sessions - FINAL Netsci 2026 Sessions.csv` | Parallel sessions + talk rows |
| `NetSci2026_sessions - Final Netsci 2026 Posters.csv` | Posters |
| `NetSci2026_sessions - Final Netsci 2026 Lighting.csv` | Lightning talks |
| `NetSci2026_sessions - Conference Schedule (tentative).csv` | Room grid for the agenda |

## `data/intermediate/` — embedding pipeline outputs

Produced by `scripts/build_sessions_embeddings.py`, `scripts/build_poster_embeddings.py`, `scripts/build_lightning_embeddings.py`, or other analysis scripts. Examples:

- Parallel: `cosine_similarity_matrix.csv`, `talk_metadata.json`, `talk_embeddings.npy`, `talk_ids.json`, …
- Posters: `poster_cosine_similarity_matrix.npy`, `poster_metadata.json`, …
- Lightning: `lightning_cosine_similarity_matrix.npy`, `lightning_metadata.json`, …

You can omit large `.npy` files when sharing **source-only**; teammates run `./rebuild.sh` to regenerate (Python + `sentence-transformers` + PyTorch for embedding steps).
