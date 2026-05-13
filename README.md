# NetSci 2026 participant program (shareable `network-app` folder)

Static React app: day-by-day schedule, posters, lightning talks, **My program**, and **Explore talks** similarity networks.

Everything needed to **edit data**, **rebuild JSON**, and **ship the site** lives **inside this directory** (no dependency on a parent repo layout).

## Quick start (team)

```bash
cd network-app
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Deploy the contents of **`dist/`** to any static host.

## Data layout

| Location | Role |
|----------|------|
| `public/program.json` | Participant schedule (built) |
| `public/sessions_graph_data.json` | Session-talk (parallel) similarity network |
| `public/poster_graph_data.json` | Poster network |
| `public/lightning_graph_data.json` | Lightning network |
| `public/netsci2026_logo.png` | Header / PDF logo |
| `data/catalog/` | Organizer CSVs (sessions, posters, lightning, schedule) — see `data/README.md` |
| `data/intermediate/` | Embedding matrices, `.npy` vectors, metadata JSON from the pipeline — see `data/README.md` |
| `scripts/` | Python rebuild pipeline (see `rebuild.sh`) |

### Pipeline (what runs where)

1. **Catalog** (`data/catalog/`) — final sessions, posters, lightning, and schedule CSVs are the source of truth for who speaks when and in which session.
2. **Embeddings** (`scripts/build_sessions_embeddings.py`, `build_poster_embeddings.py`, `build_lightning_embeddings.py`) — read those lists and write cosine similarity + vectors under `data/intermediate/`.
3. **Program + graphs** — `scripts/build_program.py` builds `public/program.json`. `scripts/preprocess_sessions.py` builds the session-talk graph: it blends **embedding cosine** with **same assigned session** from the sessions CSV; poster and lightning graphs use embedding similarity only.

## Full rebuild (embeddings + JSON + web build)

From **`network-app/`** only:

```bash
./rebuild.sh
```

This runs, in order: `scripts/build_sessions_embeddings.py` → lightning/poster embedding scripts → `scripts/build_program.py` (which runs `scripts/preprocess_lightning.py`) → poster graph → session graph → `npm install` + `npm run build`.

**Requirements:** Python 3, `numpy`, `sentence-transformers` (and its PyTorch stack), `papaparse` is not needed for Python scripts; Node 18+ for npm.

Individual Python steps (still from `network-app/`):

```bash
python3 scripts/build_sessions_embeddings.py
python3 scripts/build_lightning_embeddings.py
python3 scripts/build_poster_embeddings.py
python3 scripts/build_program.py
python3 scripts/preprocess_posters.py
python3 scripts/preprocess_sessions.py
```

## Optional env (runtime)

```bash
VITE_PROGRAM_JSON_URL="https://example.com/program.json"
```

## Legacy repo root

If you still have the old parent folder with `rebuild_everything.sh`, that script now delegates to `network-app/rebuild.sh`.
