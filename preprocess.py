#!/usr/bin/env python3
"""Convert cosine similarity matrix + metadata into graph_data.json for the React app.
Computes both embedding-based and keyword-category-based similarity."""

import csv
import json
import re
import sys
import numpy as np
from collections import deque

THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 0.50
BASE = "/Users/emoro/MyDocuments/Netsci 2026/final_program"

# ── Load metadata (embedding-based sessions) ─────────────────────────────────
with open(f"{BASE}/talk_metadata_with_clusters.json") as f:
    talks = json.load(f)

# ── Load keyword-based session assignments ────────────────────────────────────
with open(f"{BASE}/keyword_session_map.json") as f:
    keyword_map = json.load(f)

# ── Load NMF-based session assignments ────────────────────────────────────────
with open(f"{BASE}/nmf_session_map.json") as f:
    nmf_map = json.load(f)

# ── Load embedding-based similarity matrix ───────────────────────────────────
with open(f"{BASE}/cosine_similarity_matrix.csv") as f:
    reader = csv.reader(f)
    header = next(reader)
    ids = header[1:]
    emb_matrix = {}
    for row in reader:
        rid = row[0]
        emb_matrix[rid] = {ids[j]: float(row[j + 1]) for j in range(len(ids))}

# ── Load NMF-based (TF-IDF) similarity matrix ────────────────────────────────
with open(f"{BASE}/nmf_similarity_matrix.csv") as f:
    reader = csv.reader(f)
    header = next(reader)
    nmf_ids = header[1:]
    nmf_sim_dict = {}
    for row in reader:
        rid = row[0]
        nmf_sim_dict[rid] = {nmf_ids[j]: float(row[j + 1]) for j in range(len(nmf_ids))}

# ── Keyword-category similarity ──────────────────────────────────────────────
# Same keyword dictionaries used to create the session proposal
print("Computing keyword-category similarity matrix...")

CATEGORY_KEYWORDS = {
    "Epidemics": [
        "epidemic", "pandemic", "infectious", "disease spread", "sir model",
        "sis model", "seir", "vaccination", "vaccine", "immunization",
        "outbreak", "transmission", "pathogen", "infection", "covid",
        "sars", "mpox", "plague", "nosocomial", "contact tracing",
        "quarantine", "public health", "wastewater", "epidemiolog",
        "reproduction number", "r_0", "herd immunity", "case fatality",
        "incidence", "prevalence", "surveillance", "forecasting disease",
    ],
    "Contagion": [
        "contagion", "spreading process", "diffusion on network",
        "information spreading", "rumor", "cascade", "social contagion",
        "complex contagion", "simple contagion", "threshold model",
        "influence maximization", "seed selection", "viral", "meme",
        "misinformation", "infodemic", "adoption", "branching process",
    ],
    "Higher-Order": [
        "hypergraph", "simplicial", "higher-order", "higher order",
        "simplex", "hyperlink", "multiway", "clique complex",
        "group interaction", "beyond pairwise", "face", "k-simplex",
    ],
    "Dynamics": [
        "dynamical system", "bifurcation", "attractor", "chaos",
        "stability", "nonlinear", "ode", "differential equation",
        "coupled oscillator", "fixed point", "steady state",
        "turing pattern", "reaction-diffusion", "excitable",
        "multistab", "basin of attraction", "lyapunov",
    ],
    "Synchronization": [
        "synchronization", "synchrony", "kuramoto", "phase oscillator",
        "coupling", "chimera", "coherence", "entrainment", "frequency",
        "desynchron", "sync ", "coupled map", "phase transition",
        "control", "controllability", "driver node", "pinning control",
    ],
    "Brain": [
        "brain", "neural", "neuron", "cortex", "cortical", "fmri",
        "connectome", "eeg", "cognitive", "hippocampus", "synap",
        "cerebral", "white matter", "grey matter", "parcellation",
        "resting state", "functional connectivity", "structural connectivity",
        "neuroimaging", "alzheimer", "epilepsy", "psychiatric",
    ],
    "Social Networks": [
        "social network", "friendship", "social tie", "social media",
        "online social", "twitter", "facebook", "reddit", "polariz",
        "echo chamber", "homophily", "segregat", "inequality",
        "opinion dynamics", "voter model", "consensus", "partisan",
        "ideology", "political", "platform", "influence", "trust",
        "engagement", "user behavior", "misinformation",
    ],
    "Machine Learning": [
        "machine learning", "deep learning", "neural network",
        "graph neural", "gnn", "node classification", "link prediction",
        "embedding", "representation learning", "transformer",
        "autoencoder", "reinforcement learning", "attention mechanism",
        "generative model", "variational", "prediction accuracy",
        "feature extraction", "classification", "regression",
        "training", "supervised", "unsupervised", "llm", "language model",
        "artificial intelligence", "chatgpt", "ai agent",
    ],
    "Community Detection": [
        "community detection", "community structure", "modularity",
        "stochastic block model", "sbm", "partition", "clustering coefficient",
        "louvain", "leiden", "label propagation", "core-periphery",
        "assortativ", "block model", "planted partition",
        "spectral clustering", "graph clustering",
    ],
    "Biological": [
        "gene", "protein", "metabol", "cell", "biological network",
        "regulatory", "signaling", "ppi", "protein-protein",
        "transcription", "pathway", "omics", "genomic", "organism",
        "evolution", "phylogen", "mutation", "fitness", "species",
        "microbiome", "bacteria", "antibiotic", "drug",
    ],
    "Ecological": [
        "ecolog", "food web", "ecosystem", "species interaction",
        "mutualism", "predator", "prey", "biodiversity", "habitat",
        "pollination", "trophic", "extinction", "population dynamics",
        "plant", "animal", "marine",
    ],
    "Mobility": [
        "mobility", "travel", "commut", "migration", "transport",
        "traffic", "urban", "city", "cities", "spatial network",
        "geographic", "flow", "origin-destination", "census",
        "infrastructure", "road", "railway", "airport", "flight",
        "pedestrian", "bike", "vehicle", "routing",
    ],
    "Science of Science": [
        "citation", "scientific", "publication", "bibliometric",
        "journal", "author", "coauthor", "collaboration", "academic",
        "research impact", "h-index", "peer review", "open access",
        "discipline", "interdisciplin", "knowledge", "innovation",
        "patent", "inventor", "discovery", "novelty", "funding",
    ],
    "Network Models": [
        "random graph", "erdos", "renyi", "scale-free", "preferential attachment",
        "barabasi", "albert", "small world", "watts", "strogatz",
        "configuration model", "degree distribution", "power law",
        "network generation", "network model", "percolation",
        "giant component", "phase transition", "threshold",
        "random network", "network formation",
    ],
    "Geometry": [
        "geometry", "geometric", "hyperbolic", "curvature", "manifold",
        "metric space", "latent space", "dimension", "renormalization",
        "embedding space", "spatial model", "distance",
        "ricci", "forman", "ollivier",
    ],
    "Statistical Inference": [
        "inference", "bayesian", "likelihood", "estimation", "statistical",
        "reconstruction", "sampling", "monte carlo", "mcmc",
        "expectation maximization", "em algorithm", "model selection",
        "null model", "hypothesis test", "confidence",
        "maximum likelihood", "posterior", "prior",
    ],
    "Multilayer": [
        "multilayer", "multiplex", "interdependent", "layer",
        "interconnect", "cross-layer", "multi-layer",
        "coupled network", "network of networks",
    ],
    "Finance": [
        "financ", "bank", "stock", "market", "trade", "supply chain",
        "economic", "firm", "company", "industr", "business",
        "investment", "risk", "portfolio", "credit", "debt",
        "monetary", "gdp", "labor", "employment", "occupation",
        "green", "sustainab", "energy transition",
    ],
    "Algorithms": [
        "algorithm", "centrality", "betweenness", "pagerank", "eigenvector",
        "shortest path", "motif", "graphlet", "subgraph",
        "network measure", "network metric", "computation",
        "complexity", "scalab", "approximation", "heuristic",
        "spectral", "laplacian", "adjacency matrix",
        "network analysis", "topolog",
    ],
    "Culture & Technology": [
        "culture", "language", "music", "art", "creative",
        "technolog", "digital", "internet", "web", "communication",
        "narrative", "story", "book", "film", "game",
        "historical", "archaeology", "heritage",
    ],
    "Temporal": [
        "temporal network", "time-varying", "dynamic network",
        "evolution", "growing network", "link dynamics",
        "bursty", "inter-event", "timestamp", "longitudinal",
        "time series", "temporal motif",
    ],
}

# Build keyword-category feature vector for each talk
n_cats = len(CATEGORY_KEYWORDS)
cat_names = list(CATEGORY_KEYWORDS.keys())
talk_ids = [t["id"] for t in talks]

keyword_vectors = np.zeros((len(talks), n_cats))
for i, t in enumerate(talks):
    text_lower = (t["title"] + " " + t["abstract"]).lower()
    for j, cat in enumerate(cat_names):
        count = 0
        for kw in CATEGORY_KEYWORDS[cat]:
            count += len(re.findall(re.escape(kw), text_lower))
        keyword_vectors[i, j] = count

# L2-normalize rows, then cosine similarity = dot product
norms = np.linalg.norm(keyword_vectors, axis=1, keepdims=True)
norms[norms == 0] = 1  # avoid division by zero
keyword_vectors_norm = keyword_vectors / norms
kw_sim = keyword_vectors_norm @ keyword_vectors_norm.T

# Build keyword similarity dict
kw_sim_dict = {}
for i, tid_i in enumerate(talk_ids):
    kw_sim_dict[tid_i] = {}
    for j, tid_j in enumerate(talk_ids):
        kw_sim_dict[tid_i][tid_j] = float(kw_sim[i, j])

upper = kw_sim[np.triu_indices_from(kw_sim, k=1)]
print(f"  Keyword sim stats: mean={upper.mean():.4f}, std={upper.std():.4f}, max={upper.max():.4f}")

# Show edge count at various thresholds
for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
    n = (upper >= t).sum()
    print(f"    threshold {t:.1f}: {n} edges (avg degree {2*n/len(talks):.1f})")

# ── 40-color palette ─────────────────────────────────────────────────────────
COLORS = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
    "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
    "#5254a3", "#8ca252", "#bd9e39", "#ad494a", "#a55194",
]

# Color maps for both methods
embedding_labels = sorted(set(t["session_label"] for t in talks))
embedding_colors = {label: COLORS[i % len(COLORS)] for i, label in enumerate(embedding_labels)}

keyword_labels = sorted(set(keyword_map.values()))
keyword_colors = {label: COLORS[i % len(COLORS)] for i, label in enumerate(keyword_labels)}

nmf_labels = sorted(set(nmf_map.values()))
nmf_colors = {label: COLORS[i % len(COLORS)] for i, label in enumerate(nmf_labels)}

# ── Build nodes with all session assignments ──────────────────────────────────
nodes = []
for t in talks:
    abstract = t.get("abstract", "")
    # Truncate abstract for tooltip display (first ~300 chars)
    abstract_short = abstract[:300].rsplit(" ", 1)[0] + "..." if len(abstract) > 300 else abstract
    nodes.append({
        "id": t["id"],
        "title": t["title"],
        "authors": t["authors"],
        "abstract": abstract_short,
        "session_embedding": t["session_label"],
        "session_keyword": keyword_map.get(t["id"], "Unknown"),
        "session_nmf": nmf_map.get(t["id"], "Unknown"),
    })

# ── Build edges for both methods ──────────────────────────────────────────────
emb_edges = []
id_list = [t["id"] for t in talks]
for i in range(len(id_list)):
    for j in range(i + 1, len(id_list)):
        a, b = id_list[i], id_list[j]
        sim = emb_matrix.get(a, {}).get(b, emb_matrix.get(b, {}).get(a, 0))
        if sim >= THRESHOLD:
            emb_edges.append({"source": a, "target": b, "similarity": round(sim, 4)})

# Keyword threshold
KW_THRESHOLD = float(sys.argv[2]) if len(sys.argv) > 2 else 0.70
print(f"\n  Embedding edges: {len(emb_edges)} (threshold={THRESHOLD})")
print(f"  Keyword threshold: {KW_THRESHOLD}")

kw_edges = []
for i in range(len(id_list)):
    for j in range(i + 1, len(id_list)):
        a, b = id_list[i], id_list[j]
        sim = kw_sim_dict[a][b]
        if sim >= KW_THRESHOLD:
            kw_edges.append({"source": a, "target": b, "similarity": round(sim, 4)})

# NMF (TF-IDF) threshold
NMF_THRESHOLD = float(sys.argv[3]) if len(sys.argv) > 3 else 0.10
print(f"  NMF threshold: {NMF_THRESHOLD}")

nmf_edges = []
for i in range(len(id_list)):
    for j in range(i + 1, len(id_list)):
        a, b = id_list[i], id_list[j]
        sim = nmf_sim_dict.get(a, {}).get(b, 0)
        if sim >= NMF_THRESHOLD:
            nmf_edges.append({"source": a, "target": b, "similarity": round(sim, 4)})

print(f"  Keyword edges (before connectivity fix): {len(kw_edges)}")
print(f"  NMF edges (before connectivity fix): {len(nmf_edges)}")

# ── Ensure single connected component ─────────────────────────────────────────
def ensure_single_component(edges, sim_lookup, id_list):
    added = 0
    while True:
        adj = {tid: set() for tid in id_list}
        for e in edges:
            adj[e["source"]].add(e["target"])
            adj[e["target"]].add(e["source"])

        visited = set()
        components = []
        for tid in id_list:
            if tid in visited:
                continue
            comp = set()
            queue = deque([tid])
            while queue:
                node = queue.popleft()
                if node in visited:
                    continue
                visited.add(node)
                comp.add(node)
                for nb in adj[node]:
                    if nb not in visited:
                        queue.append(nb)
            components.append(comp)

        if len(components) <= 1:
            break

        components.sort(key=len, reverse=True)
        main_comp = components[0]

        for comp in components[1:]:
            best_sim = -1
            best_pair = None
            for a in comp:
                for b in main_comp:
                    s = sim_lookup.get(a, {}).get(b, 0)
                    if s > best_sim:
                        best_sim = s
                        best_pair = (a, b)
            if best_pair:
                edges.append({"source": best_pair[0], "target": best_pair[1],
                              "similarity": round(best_sim, 4)})
                main_comp.update(comp)
                added += 1

    return added

added_kw = ensure_single_component(kw_edges, kw_sim_dict, id_list)
added_emb = ensure_single_component(emb_edges, emb_matrix, id_list)
added_nmf = ensure_single_component(nmf_edges, nmf_sim_dict, id_list)
print(f"  Keyword edges: {len(kw_edges)} ({added_kw} bridge edges added)")
print(f"  Embedding edges: {len(emb_edges)} ({added_emb} bridge edges added)")
print(f"  NMF edges: {len(nmf_edges)} ({added_nmf} bridge edges added)")

# ── Compute session coherence ─────────────────────────────────────────────────
def compute_coherence(session_field, sim_lookup, nodes, id_list):
    """Mean pairwise similarity among talks in each session."""
    from collections import defaultdict
    sessions = defaultdict(list)
    for n in nodes:
        sessions[n[session_field]].append(n["id"])

    coherence = {}
    for label, members in sessions.items():
        if len(members) < 2:
            coherence[label] = 1.0
            continue
        sims = []
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                s = sim_lookup.get(a, {}).get(b, sim_lookup.get(b, {}).get(a, 0))
                sims.append(s)
        coherence[label] = round(sum(sims) / len(sims), 4) if sims else 0
    return coherence

emb_coherence = compute_coherence("session_embedding", emb_matrix, nodes, id_list)
kw_coherence = compute_coherence("session_keyword", kw_sim_dict, nodes, id_list)
nmf_coherence = compute_coherence("session_nmf", nmf_sim_dict, nodes, id_list)

print(f"\nEmbedding coherence: mean={sum(emb_coherence.values())/len(emb_coherence):.4f}")
print(f"Keyword coherence: mean={sum(kw_coherence.values())/len(kw_coherence):.4f}")
print(f"NMF coherence: mean={sum(nmf_coherence.values())/len(nmf_coherence):.4f}")

# ── Output ────────────────────────────────────────────────────────────────────
graph_data = {
    "nodes": nodes,
    "embeddingLinks": emb_edges,
    "keywordLinks": kw_edges,
    "nmfLinks": nmf_edges,
    "embeddingColors": embedding_colors,
    "keywordColors": keyword_colors,
    "nmfColors": nmf_colors,
    "embeddingThreshold": THRESHOLD,
    "keywordThreshold": round(KW_THRESHOLD, 4),
    "nmfThreshold": round(NMF_THRESHOLD, 4),
    "sessionCoherence": {
        "embedding": emb_coherence,
        "keyword": kw_coherence,
        "nmf": nmf_coherence,
    },
}

outpath = f"{BASE}/network-app/public/graph_data.json"
with open(outpath, "w") as f:
    json.dump(graph_data, f)

print(f"\nNodes: {len(nodes)}")
print(f"Embedding edges: {len(emb_edges)} (threshold >= {THRESHOLD})")
print(f"Keyword edges: {len(kw_edges)} (threshold >= {KW_THRESHOLD})")
print(f"NMF edges: {len(nmf_edges)} (threshold >= {NMF_THRESHOLD})")
print(f"Embedding sessions: {len(embedding_labels)}")
print(f"Keyword sessions: {len(keyword_labels)}")
print(f"NMF sessions: {len(nmf_labels)}")
print(f"Written to {outpath}")
