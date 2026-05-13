#!/usr/bin/env bash
# Full data + static app rebuild. Run from anywhere; paths are relative to this folder.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "NetSci network-app root: $APP_DIR"
echo "1/7 Session talk embeddings (FINAL sessions CSV)..."
python3 scripts/build_sessions_embeddings.py

echo "2/7 Lightning talk embeddings..."
python3 scripts/build_lightning_embeddings.py

echo "3/7 Poster embeddings..."
python3 scripts/build_poster_embeddings.py

echo "4/7 program.json (runs scripts/preprocess_lightning.py for lightning graph)..."
python3 scripts/build_program.py

echo "5/7 Poster similarity graph → public/poster_graph_data.json..."
python3 scripts/preprocess_posters.py

echo "6/7 Session-talk similarity graph → public/sessions_graph_data.json..."
python3 scripts/preprocess_sessions.py

echo "7/7 npm install + Vite production build..."
npm install
npm run build

echo "Done. Static site: $APP_DIR/dist/"
