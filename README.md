# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Final sessions (CSV)

The app loads **`public/netsci2026_final_sessions.csv`** (a copy of `NetSci2026_sessions - FINAL Netsci 2026 Sessions.csv` from the repo root). It skips rows where `Dropped` is `YES`, maps `Submission #` → `Assigned Session`, and restricts the graph to those talks.

To point at another URL (e.g. a hosted CSV), set in `.env`:

```bash
VITE_FINAL_SESSIONS_CSV_URL="https://example.com/your-export.csv"
```

If the CSV cannot be loaded, the app falls back to `graph_data.json` as-is plus the existing localStorage session list behavior.

To rebuild `public/graph_data.json` from the same CSV and the similarity matrix, run from `network-app/`:

```bash
python3 preprocess_final.py
```
