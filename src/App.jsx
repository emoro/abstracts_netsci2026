import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import Papa from "papaparse";
import "./App.css";

/** Default: bundled copy of `NetSci2026_sessions - FINAL Netsci 2026 Sessions.csv` in `public/`. */
const FINAL_SESSIONS_CSV_URL =
  import.meta.env.VITE_FINAL_SESSIONS_CSV_URL?.trim() ||
  import.meta.env.BASE_URL + "netsci2026_final_sessions.csv";

const SESSION_COLOR_PALETTE = [
  "#C8352E",
  "#2E86C1",
  "#28B463",
  "#F39C12",
  "#8E44AD",
  "#E74C3C",
  "#1ABC9C",
  "#D4AC0D",
  "#5B2C6F",
  "#117A65",
];

function findColumn(headers, patterns) {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const pattern of patterns) {
    const idx = lowered.findIndex((h) => pattern.test(h));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function extractTalkId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\d+/);
  return match ? match[0] : "";
}

function normalizeSessionCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^s\d+$/i.test(raw)) return raw.toUpperCase();
  if (/^ps\s*\d+(?:\.\d+)?$/i.test(raw)) return raw.toUpperCase().replace(/\s+/g, " ");
  return raw;
}

function stripSessionPrefix(label) {
  return label
    .replace(/^s\d+\s*[—-]\s*/i, "")
    .replace(/^ps\s*\d+(?:\.\d+)?\s*[—-]\s*/i, "")
    .trim();
}

/** Same palette for "Topic 1" / "Topic 2" / "Topic 3" (trailing slot 1–100 only). */
function sessionColorGroup(label) {
  const s = stripSessionPrefix(String(label || "").trim());
  return s.replace(/\s+(?:[1-9]\d?|100)\s*$/, "").trim() || s;
}

function sliceFinalSessionsCsvText(text) {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = withoutBom.match(/^Submission #,/m);
  if (!match) return null;
  return withoutBom.slice(match.index);
}

function parseFinalSessionsCsvRows(csvText) {
  const sliced = sliceFinalSessionsCsvText(csvText);
  if (!sliced) return [];
  const parsed = Papa.parse(sliced, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => String(h).trim(),
  });
  if (parsed.errors?.length) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 8));
  }
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  return data.filter(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.keys(row).some((k) => String(row[k] ?? "").trim())
  );
}

function isDroppedCell(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

function colorForSessionLabel(label, fallbackIndex = 0) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash << 5) - hash + label.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash + fallbackIndex * 31) % 360;
  return `hsl(${hue}, 55%, 46%)`;
}

function parseSessionAssignments(rows, baseData) {
  if (!rows.length) return null;

  const headers = Object.keys(rows[0]);
  const droppedColumn = findColumn(headers, [/^dropped$/i]);
  const idColumn = findColumn(headers, [
    /^submission\s*#?$/i,
    /submission.*id/i,
    /paper.*id/i,
    /talk.*id/i,
    /^id$/i,
  ]);
  const sessionColumn = findColumn(headers, [
    /^assigned session$/i,
    /^session$/i,
    /session.*label/i,
    /final.*session/i,
    /assigned.*session/i,
    /session.*title/i,
  ]);
  const sessionCodeColumn = findColumn(headers, [
    /^session\s*#$/i,
    /session.*(code|id|slot|number)/i,
    /^s\d+$/i,
  ]);

  if (!idColumn || !sessionColumn) {
    throw new Error(
      "Missing required columns. Expected a talk/submission ID column and a session column."
    );
  }

  const validTalkIds = new Set(baseData.nodes.map((n) => String(n.id)));
  const talkToSession = {};
  const sessionOrder = [];
  const seen = new Set();

  for (const row of rows) {
    if (droppedColumn && isDroppedCell(row[droppedColumn])) continue;

    const talkId = extractTalkId(row[idColumn]);
    if (!talkId || !validTalkIds.has(talkId)) continue;

    const sessionRaw = String(row[sessionColumn] || "").trim();
    if (!sessionRaw) continue;

    const sessionCode = sessionCodeColumn
      ? String(row[sessionCodeColumn] || "").trim()
      : "";
    const normalizedCode = normalizeSessionCode(sessionCode);
    const sessionLabel = normalizedCode
      ? `${normalizedCode} — ${sessionRaw}`
      : sessionRaw;

    talkToSession[talkId] = sessionLabel;
    if (!seen.has(sessionLabel)) {
      seen.add(sessionLabel);
      sessionOrder.push(sessionLabel);
    }
  }

  return { talkToSession, sessionOrder };
}

function applySheetAssignmentsToGraph(baseData, parsed) {
  const colorByGroup = {};
  const coherenceByCanonical = {};
  for (const label of baseData.sessionOrder) {
    const g = sessionColorGroup(label);
    if (baseData.colors[label] != null && colorByGroup[g] == null) {
      colorByGroup[g] = baseData.colors[label];
    }
    coherenceByCanonical[stripSessionPrefix(label)] =
      baseData.sessionCoherence[label] ?? 0;
  }

  const nodes = baseData.nodes.map((node) => {
    const sheetSession = parsed.talkToSession[String(node.id)];
    return sheetSession ? { ...node, session: sheetSession } : { ...node };
  });

  const dynamicOrder = [];
  const added = new Set();
  for (const label of parsed.sessionOrder) {
    if (!added.has(label)) {
      dynamicOrder.push(label);
      added.add(label);
    }
  }
  for (const node of nodes) {
    if (!added.has(node.session)) {
      dynamicOrder.push(node.session);
      added.add(node.session);
    }
  }

  const groupOrder = [];
  const seenGroups = new Set();
  for (const label of dynamicOrder) {
    const g = sessionColorGroup(label);
    if (!seenGroups.has(g)) {
      seenGroups.add(g);
      groupOrder.push(g);
    }
  }
  const groupPaletteFallback = {};
  groupOrder.forEach((g, idx) => {
    groupPaletteFallback[g] =
      colorByGroup[g] ||
      SESSION_COLOR_PALETTE[idx % SESSION_COLOR_PALETTE.length] ||
      colorForSessionLabel(g, idx);
  });

  const colors = {};
  const coherence = {};
  dynamicOrder.forEach((label) => {
    const g = sessionColorGroup(label);
    const canonical = stripSessionPrefix(label);
    colors[label] =
      baseData.colors[label] ||
      colorByGroup[g] ||
      groupPaletteFallback[g] ||
      colorForSessionLabel(g, 0);
    coherence[label] =
      baseData.sessionCoherence[label] ?? coherenceByCanonical[canonical] ?? 0;
  });

  return {
    ...baseData,
    nodes,
    colors,
    sessionCoherence: coherence,
    sessionOrder: dynamicOrder,
  };
}

function filterGraphToAssignedTalks(graphData, talkToSession) {
  const ids = new Set(Object.keys(talkToSession));
  const nodes = graphData.nodes.filter((n) => ids.has(String(n.id)));
  const idSet = new Set(nodes.map((n) => String(n.id)));
  const links = graphData.links.filter((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return idSet.has(String(s)) && idSet.has(String(t));
  });
  const sessionOrder = graphData.sessionOrder.filter((label) =>
    nodes.some((n) => n.session === label)
  );
  const colors = {};
  const sessionCoherence = {};
  for (const label of sessionOrder) {
    colors[label] = graphData.colors[label];
    sessionCoherence[label] = graphData.sessionCoherence[label] ?? 0;
  }
  return {
    ...graphData,
    nodes,
    links,
    sessionOrder,
    colors,
    sessionCoherence,
  };
}

function buildSessionCards(data) {
  const sessionMap = {};
  for (const label of data.sessionOrder) {
    sessionMap[label] = {
      id: label,
      label,
      color: data.colors[label],
      coherence: data.sessionCoherence[label] || 0,
      talkIds: [],
    };
  }
  for (const node of data.nodes) {
    if (sessionMap[node.session]) {
      sessionMap[node.session].talkIds.push(node.id);
    }
  }
  return data.sessionOrder.map((label) => sessionMap[label]);
}

function App() {
  const [rawData, setRawData] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightSession, setHighlightSession] = useState(null);
  const [view, setView] = useState("landing");
  const [sessions, setSessions] = useState(null);
  const [expandedTalk, setExpandedTalk] = useState(null);
  const fgRef = useRef();

  const STORAGE_KEY = "netsci2026_final_sessions";

  useEffect(() => {
    document.body.style.overflow = view === "landing" ? "auto" : "hidden";
  }, [view]);

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const baseUrl = import.meta.env.BASE_URL;
      const response = await fetch(baseUrl + "graph_data.json");
      const baseData = await response.json();
      let hydratedData = baseData;
      let loadedFromFinalCsv = false;

      try {
        const csvResponse = await fetch(FINAL_SESSIONS_CSV_URL);
        if (!csvResponse.ok) {
          throw new Error(`HTTP ${csvResponse.status}`);
        }
        const csvText = await csvResponse.text();
        const rows = parseFinalSessionsCsvRows(csvText);
        const parsed = parseSessionAssignments(rows, baseData);
        if (parsed && Object.keys(parsed.talkToSession).length > 0) {
          const reassigned = applySheetAssignmentsToGraph(baseData, parsed);
          hydratedData = filterGraphToAssignedTalks(reassigned, parsed.talkToSession);
          loadedFromFinalCsv = true;
        } else {
          console.warn("Final sessions CSV had no rows matching graph talks.");
        }
      } catch (err) {
        console.warn("Could not load final sessions CSV:", err);
      }

      if (cancelled) return;

      setRawData(hydratedData);
      const defaultSessions = buildSessionCards(hydratedData);

      if (loadedFromFinalCsv) {
        setSessions(defaultSessions);
        return;
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setSessions(JSON.parse(saved));
          return;
        } catch {
          // fall through to default data
        }
      }
      setSessions(defaultSessions);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (sessions) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  // Talk lookup
  const talkMap = useMemo(() => {
    if (!rawData) return {};
    const m = {};
    for (const n of rawData.nodes) m[n.id] = n;
    return m;
  }, [rawData]);


  // ── Session cards ─────────────────────────────────────────────────────────
  const sessionCards = useMemo(() => {
    if (!sessions || !rawData) return [];
    return sessions.map((s) => ({
      ...s,
      talks: s.talkIds.map((id) => talkMap[id]).filter(Boolean),
    }));
  }, [sessions, rawData, talkMap]);

  // ── Download Word ─────────────────────────────────────────────────────────
  const downloadWord = useCallback(async () => {
    if (!sessionCards || !sessionCards.length) return;
    const {
      Document, Packer, Paragraph, TextRun,
      HeadingLevel, AlignmentType, BorderStyle,
    } = await import("docx");
    const { saveAs } = await import("file-saver");

    const children = [];
    children.push(
      new Paragraph({
        text: "NetSci 2026 — Contributed Sessions",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${sessionCards.reduce((s, c) => s + c.talks.length, 0)} talks · ${sessionCards.length} sessions`,
            italics: true,
            color: "888888",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    for (const card of sessionCards) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: card.label, bold: true, size: 28 }),
            new TextRun({
              text: `  (${card.talks.length} talks · coherence: ${card.coherence.toFixed(2)})`,
              color: "888888",
              size: 20,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          },
        })
      );
      for (const talk of card.talks) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: talk.title, bold: true, size: 22 })],
            spacing: { before: 150, after: 40 },
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: talk.authors, italics: true, color: "555555", size: 20 }),
            ],
            spacing: { after: 40 },
          })
        );
        if (talk.abstract) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: talk.abstract, size: 19, color: "333333" })],
              spacing: { after: 100 },
            })
          );
        }
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, "netsci2026_sessions.docx");
  }, [sessionCards]);

  // ── Network view logic ────────────────────────────────────────────────────
  const { graphData, neighborMap } = useMemo(() => {
    if (!rawData) return { graphData: null, neighborMap: {} };
    const links = rawData.links.map((l) => ({ ...l }));
    const nodes = rawData.nodes.map((n) => ({ ...n }));
    const adj = {};
    nodes.forEach((n) => (adj[n.id] = new Set()));
    rawData.links.forEach((l) => {
      adj[l.source]?.add(l.target);
      adj[l.target]?.add(l.source);
    });
    return { graphData: { nodes, links }, neighborMap: adj };
  }, [rawData]);

  const sessionColors = useMemo(() => rawData?.colors || {}, [rawData]);

  const activeNode = hoveredNode || selectedNode;

  const nodeColor = useCallback(
    (node) => {
      const sess = node.session;
      if (highlightSession && sess !== highlightSession)
        return "rgba(180,180,180,0.2)";
      if (activeNode) {
        if (node.id === activeNode.id || neighborMap[activeNode.id]?.has(node.id))
          return sessionColors[sess] || "#999";
        return "rgba(180,180,180,0.2)";
      }
      return sessionColors[sess] || "#999";
    },
    [activeNode, highlightSession, sessionColors, neighborMap]
  );

  const linkColor = useCallback(
    (link) => {
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      if (highlightSession) {
        const sNode = typeof link.source === "object" ? link.source : null;
        const tNode = typeof link.target === "object" ? link.target : null;
        if (sNode?.session !== highlightSession && tNode?.session !== highlightSession)
          return "rgba(0,0,0,0.02)";
      }
      if (activeNode) {
        if (sid === activeNode.id || tid === activeNode.id)
          return "rgba(50,50,50,0.5)";
        return "rgba(0,0,0,0.02)";
      }
      return "rgba(0,0,0,0.12)";
    },
    [activeNode, highlightSession]
  );

  const linkWidth = useCallback(
    (link) => {
      if (activeNode) {
        const sid = typeof link.source === "object" ? link.source.id : link.source;
        const tid = typeof link.target === "object" ? link.target.id : link.target;
        if (sid === activeNode.id || tid === activeNode.id) return 1.5;
      }
      return 0.5;
    },
    [activeNode]
  );

  const wrapText = useCallback((text, maxWidth, ctx) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = words[0] || "";
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + " " + words[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines;
  }, []);

  const nodeCanvasObject = useCallback(
    (node, ctx, globalScale) => {
      const r = 6;
      const color = nodeColor(node);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (activeNode && node.id === activeNode.id) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const fontSize = Math.max(12 / globalScale, 3);
        const lineHeight = fontSize * 1.3;
        const maxWidth = 300 / globalScale;
        const padding = 8 / globalScale;

        ctx.font = `bold ${fontSize}px Sans-Serif`;
        const titleLines = wrapText(node.title, maxWidth, ctx);

        ctx.font = `${fontSize * 0.82}px Sans-Serif`;
        const authorsText =
          node.authors.length > 100 ? node.authors.slice(0, 97) + "..." : node.authors;
        const authorLines = wrapText(authorsText, maxWidth, ctx);

        const session = node.session || "Unknown";
        ctx.font = `bold ${fontSize * 0.75}px Sans-Serif`;
        const sessionWidth = ctx.measureText(session).width;

        ctx.font = `${fontSize * 0.78}px Sans-Serif`;
        const abstractText = node.abstract
          ? node.abstract.length > 200
            ? node.abstract.slice(0, 200) + "..."
            : node.abstract
          : "";
        const abstractLines = abstractText ? wrapText(abstractText, maxWidth, ctx) : [];
        const displayAbstractLines = abstractLines.slice(0, 6);
        if (abstractLines.length > 6) displayAbstractLines[5] += "...";

        const gapAfterTitle = lineHeight * 0.2;
        const gapAfterAuthors = lineHeight * 0.4;
        const badgeHeight = fontSize * 1.8;
        const gapAfterBadge = lineHeight * 0.6;
        const totalLines =
          titleLines.length + authorLines.length + displayAbstractLines.length;
        const tooltipHeight =
          totalLines * lineHeight +
          padding * 2 +
          gapAfterTitle +
          gapAfterAuthors +
          badgeHeight +
          gapAfterBadge +
          lineHeight * 0.8;

        ctx.font = `bold ${fontSize}px Sans-Serif`;
        let boxWidth = 0;
        for (const line of titleLines)
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        ctx.font = `${fontSize * 0.82}px Sans-Serif`;
        for (const line of authorLines)
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        ctx.font = `${fontSize * 0.78}px Sans-Serif`;
        for (const line of displayAbstractLines)
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        boxWidth = Math.max(boxWidth, sessionWidth + padding * 2);
        boxWidth += padding * 2;

        const boxX = node.x - boxWidth / 2;
        const boxY = node.y - r - 6 / globalScale - tooltipHeight;

        // Background
        ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
        ctx.beginPath();
        const br = 4 / globalScale;
        ctx.moveTo(boxX + br, boxY);
        ctx.lineTo(boxX + boxWidth - br, boxY);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + br);
        ctx.lineTo(boxX + boxWidth, boxY + tooltipHeight - br);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY + tooltipHeight, boxX + boxWidth - br, boxY + tooltipHeight);
        ctx.lineTo(boxX + br, boxY + tooltipHeight);
        ctx.quadraticCurveTo(boxX, boxY + tooltipHeight, boxX, boxY + tooltipHeight - br);
        ctx.lineTo(boxX, boxY + br);
        ctx.quadraticCurveTo(boxX, boxY, boxX + br, boxY);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();

        // Title
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        let y = boxY + padding + lineHeight * 0.8;
        for (const line of titleLines) {
          ctx.fillText(line, boxX + padding, y);
          y += lineHeight;
        }
        y += gapAfterTitle;

        // Authors
        ctx.font = `${fontSize * 0.82}px Sans-Serif`;
        ctx.fillStyle = "#777";
        for (const line of authorLines) {
          ctx.fillText(line, boxX + padding, y);
          y += lineHeight;
        }
        y += gapAfterAuthors;

        // Session badge
        const badgePadH = padding * 0.8;
        const badgePadV = fontSize * 0.25;
        const badgeW = sessionWidth + badgePadH * 2;
        const badgeH = fontSize * 1.1 + badgePadV * 2;
        const badgeColor = sessionColors[session] || "#999";
        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        const bbr = 3 / globalScale;
        const bx = boxX + padding;
        const by = y - fontSize * 0.3;
        ctx.moveTo(bx + bbr, by);
        ctx.lineTo(bx + badgeW - bbr, by);
        ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + bbr);
        ctx.lineTo(bx + badgeW, by + badgeH - bbr);
        ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - bbr, by + badgeH);
        ctx.lineTo(bx + bbr, by + badgeH);
        ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - bbr);
        ctx.lineTo(bx, by + bbr);
        ctx.quadraticCurveTo(bx, by, bx + bbr, by);
        ctx.fill();
        ctx.font = `bold ${fontSize * 0.75}px Sans-Serif`;
        ctx.fillStyle = "#fff";
        ctx.fillText(session, bx + badgePadH, by + badgePadV + fontSize * 0.85);

        y = by + badgeH + gapAfterBadge + lineHeight * 0.8;

        // Abstract
        if (displayAbstractLines.length > 0) {
          ctx.font = `${fontSize * 0.78}px Sans-Serif`;
          ctx.fillStyle = "#666";
          for (const line of displayAbstractLines) {
            ctx.fillText(line, boxX + padding, y);
            y += lineHeight;
          }
        }
      }
    },
    [nodeColor, activeNode, wrapText, sessionColors]
  );

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const sessionList = rawData
    ? rawData.sessionOrder.map((label) => [label, rawData.colors[label]])
    : [];

  if (!rawData) {
    return <div className="loading">Loading graph data...</div>;
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  if (view === "landing") {
    return (
      <div className="landing">
        <div className="landing-header">
          <img
            src={import.meta.env.BASE_URL + "netsci2026_logo.png"}
            alt="NetSci 2026"
            className="landing-logo"
          />
          <div className="landing-title">
            <h1>NetSci 2026 Contributed Sessions</h1>
            <p>
              {sessionCards.reduce((sum, c) => sum + c.talks.length, 0)} talks
              in {sessionCards.length} sessions
            </p>
          </div>
          <button className="download-btn" onClick={downloadWord} title="Download as Word">
            Download .docx
          </button>
          <button className="explore-btn" onClick={() => setView("network")}>
            Explore Network
          </button>
        </div>

        <div className="cards-grid">
          {sessionCards.map((card) => (
            <div
              key={card.id}
              className="session-card"
              style={{ borderLeftColor: card.color }}
            >
              <div className="card-header">
                <h2>{card.label}</h2>
              </div>
              <div className="card-meta">
                {card.talks.length} talks · Coherence = {(card.coherence * 100).toFixed(0)}%
              </div>
              <div className="card-talks">
                {card.talks.map((talk) => (
                  <div
                    key={talk.id}
                    className={`card-talk${expandedTalk === talk.id ? " card-talk-expanded" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedTalk(expandedTalk === talk.id ? null : talk.id);
                    }}
                  >
                    <span className="card-talk-title">{talk.title}</span>
                    <span className="card-talk-authors">{talk.authors}</span>
                    {expandedTalk === talk.id && (
                      <div className="card-talk-detail">
                        <p className="card-talk-abstract">{talk.abstract}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Network view ──────────────────────────────────────────────────────────
  const nodeCount = graphData?.nodes?.length || 0;

  return (
    <div className="app">
      <div className="graph-container">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeColor={nodeColor}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onNodeHover={setHoveredNode}
          onNodeClick={(node) =>
            setSelectedNode(selectedNode?.id === node.id ? null : node)
          }
          onBackgroundClick={() => {
            setSelectedNode(null);
            setHighlightSession(null);
          }}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          cooldownTicks={300}
          warmupTicks={100}
          backgroundColor="#ffffff"
        />
        <div className="title-bar">
          <img src={import.meta.env.BASE_URL + "netsci2026_logo.png"} alt="NetSci 2026" />
          <div className="title-text">
            <h1>Contributed talks Network</h1>
            <p>
              {nodeCount} talks &middot; {sessionList.length} sessions
            </p>
          </div>
        </div>
        <button className="back-btn" onClick={() => setView("landing")}>
          Back to Sessions
        </button>
      </div>

      <div className="sidebar">
        <div className="legend-panel">
          <h3>Sessions ({sessionList.length})</h3>
          <div className="legend-list">
            {sessionList.map(([label, color]) => (
              <div
                key={label}
                className={`legend-item ${highlightSession === label ? "active" : ""}`}
                onClick={() =>
                  setHighlightSession(highlightSession === label ? null : label)
                }
              >
                <span className="legend-dot" style={{ backgroundColor: color }} />
                <span className="legend-label">{label}</span>
                <span className="legend-count">
                  {graphData.nodes.filter((n) => n.session === label).length}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
