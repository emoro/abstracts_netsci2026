import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import "./App.css";

const METHODS = {
  embedding: {
    key: "session_embedding",
    linksKey: "embeddingLinks",
    label: "Embedding-based",
  },
  keyword: {
    key: "session_keyword",
    linksKey: "keywordLinks",
    label: "Keyword Matching",
  },
};

function App() {
  const [rawData, setRawData] = useState(null);
  const [colorMaps, setColorMaps] = useState({});
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightSession, setHighlightSession] = useState(null);
  const [method, setMethod] = useState("embedding");
  const [thresholds, setThresholds] = useState({});
  const fgRef = useRef();

  const sessionField = METHODS[method].key;

  useEffect(() => {
    fetch("/graph_data.json")
      .then((r) => r.json())
      .then((data) => {
        setRawData(data);
        setColorMaps({
          embedding: data.embeddingColors,
          keyword: data.keywordColors,
        });
        setThresholds({
          embedding: data.embeddingThreshold,
          keyword: data.keywordThreshold,
        });
      });
  }, []);

  const { graphData, neighborMap } = useMemo(() => {
    if (!rawData) return { graphData: null, neighborMap: {} };

    const srcLinks = rawData[METHODS[method].linksKey] || [];
    const links = srcLinks.map((l) => ({ ...l }));
    const nodes = rawData.nodes.map((n) => ({ ...n }));
    const gd = { nodes, links };

    const adj = {};
    nodes.forEach((n) => (adj[n.id] = new Set()));
    srcLinks.forEach((l) => {
      adj[l.source]?.add(l.target);
      adj[l.target]?.add(l.source);
    });

    return { graphData: gd, neighborMap: adj };
  }, [rawData, method]);

  const sessionColors = colorMaps[method] || {};

  const getSession = useCallback(
    (node) => node[sessionField],
    [sessionField]
  );

  const activeNode = hoveredNode || selectedNode;

  const nodeColor = useCallback(
    (node) => {
      const sess = getSession(node);
      if (highlightSession && sess !== highlightSession) {
        return "rgba(180,180,180,0.2)";
      }
      if (activeNode) {
        if (
          node.id === activeNode.id ||
          neighborMap[activeNode.id]?.has(node.id)
        ) {
          return sessionColors[sess] || "#999";
        }
        return "rgba(180,180,180,0.2)";
      }
      return sessionColors[sess] || "#999";
    },
    [activeNode, highlightSession, sessionColors, neighborMap, getSession]
  );

  const linkColor = useCallback(
    (link) => {
      const sid =
        typeof link.source === "object" ? link.source.id : link.source;
      const tid =
        typeof link.target === "object" ? link.target.id : link.target;

      if (highlightSession) {
        const sNode =
          typeof link.source === "object" ? link.source : null;
        const tNode =
          typeof link.target === "object" ? link.target : null;
        if (
          sNode?.[sessionField] !== highlightSession &&
          tNode?.[sessionField] !== highlightSession
        ) {
          return "rgba(0,0,0,0.02)";
        }
      }
      if (activeNode) {
        if (sid === activeNode.id || tid === activeNode.id) {
          return "rgba(50,50,50,0.5)";
        }
        return "rgba(0,0,0,0.02)";
      }
      return "rgba(0,0,0,0.12)";
    },
    [activeNode, highlightSession, sessionField]
  );

  const linkWidth = useCallback(
    (link) => {
      if (activeNode) {
        const sid =
          typeof link.source === "object" ? link.source.id : link.source;
        const tid =
          typeof link.target === "object" ? link.target.id : link.target;
        if (sid === activeNode.id || tid === activeNode.id) {
          return 1.5;
        }
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

        // Title
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        const titleLines = wrapText(node.title, maxWidth, ctx);

        // Authors
        ctx.font = `${fontSize * 0.82}px Sans-Serif`;
        const authorsText =
          node.authors.length > 100
            ? node.authors.slice(0, 97) + "..."
            : node.authors;
        const authorLines = wrapText(authorsText, maxWidth, ctx);

        // Session badge
        const session = getSession(node);
        const sessionText = session || "Unknown";
        ctx.font = `bold ${fontSize * 0.75}px Sans-Serif`;
        const sessionWidth = ctx.measureText(sessionText).width;

        // Abstract (first ~150 chars)
        ctx.font = `${fontSize * 0.78}px Sans-Serif`;
        const abstractText = node.abstract
          ? node.abstract.length > 200
            ? node.abstract.slice(0, 200).rsplit
              ? node.abstract.slice(0, 200) + "..."
              : node.abstract.slice(0, 200) + "..."
            : node.abstract
          : "";
        const abstractLines = abstractText
          ? wrapText(abstractText, maxWidth, ctx)
          : [];
        // Limit abstract to 4 lines max
        const displayAbstractLines = abstractLines.slice(0, 4);
        if (abstractLines.length > 4) {
          displayAbstractLines[3] = displayAbstractLines[3] + "...";
        }

        // Compute total height
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

        // Compute box width
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        let boxWidth = 0;
        for (const line of titleLines) {
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        }
        ctx.font = `${fontSize * 0.82}px Sans-Serif`;
        for (const line of authorLines) {
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        }
        ctx.font = `${fontSize * 0.78}px Sans-Serif`;
        for (const line of displayAbstractLines) {
          boxWidth = Math.max(boxWidth, ctx.measureText(line).width);
        }
        boxWidth = Math.max(boxWidth, sessionWidth + padding * 2);
        boxWidth += padding * 2;

        const boxX = node.x - boxWidth / 2;
        const boxY = node.y - r - 6 / globalScale - tooltipHeight;

        // Draw tooltip background
        ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
        ctx.beginPath();
        const br = 4 / globalScale;
        ctx.moveTo(boxX + br, boxY);
        ctx.lineTo(boxX + boxWidth - br, boxY);
        ctx.quadraticCurveTo(
          boxX + boxWidth, boxY, boxX + boxWidth, boxY + br
        );
        ctx.lineTo(boxX + boxWidth, boxY + tooltipHeight - br);
        ctx.quadraticCurveTo(
          boxX + boxWidth, boxY + tooltipHeight,
          boxX + boxWidth - br, boxY + tooltipHeight
        );
        ctx.lineTo(boxX + br, boxY + tooltipHeight);
        ctx.quadraticCurveTo(
          boxX, boxY + tooltipHeight, boxX, boxY + tooltipHeight - br
        );
        ctx.lineTo(boxX, boxY + br);
        ctx.quadraticCurveTo(boxX, boxY, boxX + br, boxY);
        ctx.fill();

        // Border
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();

        // Draw shadow line at bottom
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 2 / globalScale;
        ctx.beginPath();
        ctx.moveTo(boxX + 2 / globalScale, boxY + tooltipHeight + 1 / globalScale);
        ctx.lineTo(boxX + boxWidth - 2 / globalScale, boxY + tooltipHeight + 1 / globalScale);
        ctx.stroke();

        // Title text
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        let y = boxY + padding + lineHeight * 0.8;
        for (const line of titleLines) {
          ctx.fillText(line, boxX + padding, y);
          y += lineHeight;
        }

        y += gapAfterTitle;

        // Authors text
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
        ctx.fillText(sessionText, bx + badgePadH, by + badgePadV + fontSize * 0.85);

        y = by + badgeH + gapAfterBadge + lineHeight * 0.8;

        // Abstract text
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
    [nodeColor, activeNode, wrapText, getSession, sessionColors]
  );

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const sessionList = Object.entries(sessionColors).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const edgeCount = graphData?.links?.length || 0;
  const nodeCount = graphData?.nodes?.length || 0;
  const threshold = thresholds[method] || 0;

  if (!graphData) {
    return <div className="loading">Loading graph data...</div>;
  }

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
          <img src="/netsci2026_logo.png" alt="NetSci 2026" />
          <div className="title-text">
            <h1>Abstract Similarity Network</h1>
            <p>
              {nodeCount} talks &middot; {edgeCount.toLocaleString()} edges
              &middot; similarity &ge; {threshold.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="sidebar">
        <div className="method-toggle">
          {Object.entries(METHODS).map(([key, { label }]) => (
            <button
              key={key}
              className={`toggle-btn ${method === key ? "active" : ""}`}
              onClick={() => {
                setMethod(key);
                setHighlightSession(null);
                setSelectedNode(null);
                setHoveredNode(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="legend-panel">
          <h3>Sessions ({sessionList.length})</h3>
          <div className="legend-list">
            {sessionList.map(([label, color]) => (
              <div
                key={label}
                className={`legend-item ${
                  highlightSession === label ? "active" : ""
                }`}
                onClick={() =>
                  setHighlightSession(
                    highlightSession === label ? null : label
                  )
                }
              >
                <span
                  className="legend-dot"
                  style={{ backgroundColor: color }}
                />
                <span className="legend-label">{label}</span>
                <span className="legend-count">
                  {
                    graphData.nodes.filter(
                      (n) => n[sessionField] === label
                    ).length
                  }
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
