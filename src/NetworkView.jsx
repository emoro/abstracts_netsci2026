import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useProgramCart } from "./ProgramCartContext.jsx";
import { splitSessionLabel } from "./programUtils";

/** Same path as ProgramView `HeartIcon` (Feather heart). */
const NETWORK_HEART_PATH =
  "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

function graphKindFromGraphUrl(url) {
  const u = String(url || "");
  if (u.includes("poster_graph")) return "poster";
  if (u.includes("lightning_graph")) return "lightning";
  return "parallel";
}

function buildCartItemFromNetworkNode(node, kind) {
  const authorsStr = String(node.authors || "");
  const speaker =
    String(node.primarySpeaker || "").trim() ||
    authorsStr.split(",")[0]?.replace(/\*/g, "").trim() ||
    "";
  return {
    kind,
    id: String(node.id),
    title: String(node.title || ""),
    day: String(node.day || ""),
    time: String(node.time || ""),
    speaker,
    sessionLabel: String(node.session || "").trim(),
  };
}

function paintNetworkHeart(ctx, cx, cy, drawSizePx, filled) {
  const s = drawSizePx / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  const p = new Path2D(NETWORK_HEART_PATH);
  if (filled) {
    ctx.fillStyle = "#c8352e";
    ctx.fill(p);
  } else {
    ctx.strokeStyle = "#b0b0b0";
    ctx.lineWidth = 1.85;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(p);
  }
  ctx.restore();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
  const br = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + br, y);
  ctx.lineTo(x + w - br, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + br);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + br, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - br);
  ctx.lineTo(x, y + br);
  ctx.quadraticCurveTo(x, y, x + br, y);
  ctx.closePath();
  ctx.stroke();
}

function fillRoundRect(ctx, x, y, w, h, r) {
  const br = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + br, y);
  ctx.lineTo(x + w - br, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + br);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + br, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - br);
  ctx.lineTo(x, y + br);
  ctx.quadraticCurveTo(x, y, x + br, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Tooltip drawn in `onRenderFramePost` so it stacks above all nodes.
 * `viewport` is optional visible graph bounds { minX, maxX, minY, maxY } (from screen corners);
 * when set, the card flips below the node or clamps to stay inside the view.
 */
function paintNetworkNodeTooltip(
  ctx,
  globalScale,
  node,
  sessionColors,
  wrapText,
  viewport = null,
  heartLiked = false,
  heartHitRef = null
) {
  const r = 6;
  const px = (n) => n / globalScale;
  const sessionStr = String(node.session || "");
  const accentColor = sessionColors[sessionStr] || "#c8352e";
  const authorsStr = String(node.authors || "");
  const speaker =
    String(node.primarySpeaker || "").trim() ||
    authorsStr.split(",")[0]?.replace(/\*/g, "").trim() ||
    "";

  const padX = px(12);
  const padY = px(10);
  const gapSm = px(5);
  const gapMd = px(8);
  const accentW = px(3);
  const brCard = px(6);
  const fullInner = px(268);
  const heartSlot = px(26);
  const maxLineW = fullInner - heartSlot;
  const innerContentW = fullInner;

  const fontMeta = `500 ${px(8.8)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const fontTitle = `600 ${px(12.6)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const fontAuthor = `${px(10)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const fontAbstract = `${px(8.6)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  const fsMeta = px(8.8);
  const fsTitle = px(12.6);
  const fsAuthor = px(10);
  const fsAbs = px(8.6);
  const lhMeta = fsMeta * 1.38;
  const lhTitle = fsTitle * 1.28;
  const lhAuthor = fsAuthor * 1.32;
  const lhAbs = fsAbs * 1.38;

  const { code, name: sessionName } = splitSessionLabel(sessionStr);
  const sessionLine1 =
    sessionName && code ? `${code} - ${sessionName}` : code || sessionStr || "—";
  const sessionLine2 = [node.day, node.time].filter(Boolean).join(" - ");

  ctx.font = fontMeta;
  const metaLines1 = sessionLine1 ? wrapText(sessionLine1, maxLineW, ctx) : [];
  const metaLines2 = sessionLine2 ? wrapText(sessionLine2, maxLineW, ctx) : [];

  ctx.font = fontTitle;
  const titleLines = wrapText(String(node.title || ""), maxLineW, ctx);

  const authorText =
    speaker || (authorsStr.length > 140 ? `${authorsStr.slice(0, 137)}...` : authorsStr);
  ctx.font = fontAuthor;
  const authorLines = authorText ? wrapText(authorText, maxLineW, ctx) : [];

  const abstractRaw = String(node.abstract || "").trim();
  ctx.font = fontAbstract;
  const abstractLinesAll = abstractRaw ? wrapText(abstractRaw, maxLineW, ctx) : [];
  const abstractLines = abstractLinesAll.slice(0, 5);

  const headH =
    metaLines1.length * lhMeta + (metaLines2.length ? gapSm + metaLines2.length * lhMeta : 0);
  const bodyH =
    titleLines.length * lhTitle +
    (authorLines.length ? gapSm + authorLines.length * lhAuthor : 0) +
    (abstractLines.length ? gapSm + abstractLines.length * lhAbs : 0);

  const totalH = padY + headH + gapMd + bodyH + padY;
  const boxWidth = accentW + padX + innerContentW + padX;
  const gapFromNode = r + px(8);
  const marginG = px(10);

  let boxX = node.x - boxWidth / 2;
  let boxY = node.y - gapFromNode - totalH;

  if (
    viewport &&
    Number.isFinite(viewport.minX) &&
    Number.isFinite(viewport.maxX) &&
    Number.isFinite(viewport.minY) &&
    Number.isFinite(viewport.maxY)
  ) {
    const { minX, maxX, minY, maxY } = viewport;
    const innerW = maxX - minX - 2 * marginG;
    const innerH = maxY - minY - 2 * marginG;
    if (innerW > 0 && innerH > totalH) {
      const yAbove = node.y - gapFromNode - totalH;
      const yBelow = node.y + gapFromNode;
      const inY = (y) =>
        y >= minY + marginG && y + totalH <= maxY - marginG;
      const overflowsAbove =
        yAbove < minY + marginG || yAbove + totalH > maxY - marginG;
      if (overflowsAbove && inY(yBelow)) {
        boxY = yBelow;
      } else {
        boxY = Math.max(minY + marginG, Math.min(maxY - marginG - totalH, yAbove));
      }
      boxX = Math.max(minX + marginG, Math.min(maxX - marginG - boxWidth, boxX));
    }
  }

  const cardLeft = boxX;
  const cardTop = boxY;
  const cardW = boxWidth;
  const cardH = totalH;

  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, cardLeft, cardTop, cardW, cardH, brCard);
  ctx.fillStyle = accentColor;
  ctx.fillRect(cardLeft + px(1), cardTop + brCard * 0.35, accentW, cardH - brCard * 0.7);
  ctx.strokeStyle = "#e6e6e6";
  ctx.lineWidth = Math.max(1 / globalScale, 0.5);
  strokeRoundRect(ctx, cardLeft, cardTop, cardW, cardH, brCard);

  const tx = cardLeft + accentW + padX;
  let ty = cardTop + padY;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = "#777777";
  ctx.font = fontMeta;
  for (const line of metaLines1) {
    ctx.fillText(line, tx, ty);
    ty += lhMeta;
  }
  if (metaLines2.length) {
    ty += gapSm;
    for (const line of metaLines2) {
      ctx.fillText(line, tx, ty);
      ty += lhMeta;
    }
  }

  const heartDraw = px(17);
  const heartCx = cardLeft + accentW + padX + fullInner - heartSlot / 2;
  const heartCy = cardTop + padY + lhMeta * 0.62;
  paintNetworkHeart(ctx, heartCx, heartCy, heartDraw, heartLiked);
  if (heartHitRef) {
    const hitHalf = px(11);
    heartHitRef.current = {
      nodeId: node.id,
      minX: heartCx - hitHalf,
      maxX: heartCx + hitHalf,
      minY: heartCy - hitHalf,
      maxY: heartCy + hitHalf,
    };
  }

  ty += gapMd;
  ctx.font = fontTitle;
  ctx.fillStyle = "#222222";
  for (const line of titleLines) {
    ctx.fillText(line, tx, ty);
    ty += lhTitle;
  }
  if (authorLines.length) {
    ty += gapSm;
    ctx.font = fontAuthor;
    ctx.fillStyle = "#555555";
    for (const line of authorLines) {
      ctx.fillText(line, tx, ty);
      ty += lhAuthor;
    }
  }
  if (abstractLines.length) {
    ty += gapSm;
    ctx.font = fontAbstract;
    ctx.fillStyle = "#666666";
    for (const line of abstractLines) {
      ctx.fillText(line, tx, ty);
      ty += lhAbs;
    }
  }
}

export default function NetworkView({
  onBack,
  focusTalkId,
  embedded = false,
  searchHighlightIds = null,
  dayActiveTalkIds,
  graphUrl,
}) {
  const [rawData, setRawData] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightSession, setHighlightSession] = useState(null);
  const fgRef = useRef();
  const tooltipHeartHitRef = useRef(null);
  const graphContainerRef = useRef(null);
  const [graphDims, setGraphDims] = useState({ width: 640, height: 480 });
  const { isLiked, toggleLike } = useProgramCart();
  const graphKind = useMemo(() => graphKindFromGraphUrl(graphUrl), [graphUrl]);

  useEffect(() => {
    if (embedded) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [embedded]);

  useEffect(() => {
    let cancelled = false;
    const url = graphUrl || `${import.meta.env.BASE_URL}sessions_graph_data.json`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRawData(data);
      })
      .catch((err) => console.warn("Could not load graph data:", err));
    return () => {
      cancelled = true;
    };
  }, [graphUrl]);

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

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w >= 32 && h >= 32) setGraphDims({ width: w, height: h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rawData, graphData]);

  useEffect(() => {
    if (!graphData || graphDims.width < 32 || graphDims.height < 32) return undefined;
    const id = window.setTimeout(() => {
      fgRef.current?.zoomToFit?.(400, 36);
    }, 80);
    return () => clearTimeout(id);
  }, [graphData, graphDims.width, graphDims.height, embedded]);

  const sessionColors = useMemo(() => rawData?.colors || {}, [rawData]);

  const focusNode = useMemo(() => {
    if (!focusTalkId || !graphData) return null;
    return graphData.nodes.find((n) => String(n.id) === String(focusTalkId)) || null;
  }, [focusTalkId, graphData]);

  const activeNode = hoveredNode || selectedNode || focusNode;

  const activeCartItem = useMemo(() => {
    if (!activeNode) return null;
    return buildCartItemFromNetworkNode(activeNode, graphKind);
  }, [activeNode, graphKind]);

  const tooltipHeartLiked =
    activeCartItem != null && isLiked(activeCartItem.kind, activeCartItem.id);

  const nodeColor = useCallback(
    (node) => {
      const sess = node.session;
      const idStr = String(node.id);
      if (dayActiveTalkIds != null && !dayActiveTalkIds.has(idStr)) {
        return "rgba(180,180,180,0.2)";
      }
      const inSearch =
        searchHighlightIds != null && searchHighlightIds.has(idStr);

      if (highlightSession && sess !== highlightSession) return "rgba(180,180,180,0.2)";
      if (activeNode) {
        if (node.id === activeNode.id || neighborMap[activeNode.id]?.has(node.id)) {
          return sessionColors[sess] || "#999";
        }
        return "rgba(180,180,180,0.2)";
      }
      if (searchHighlightIds != null) {
        if (inSearch) return sessionColors[sess] || "#999";
        return "rgba(180,180,180,0.2)";
      }
      return sessionColors[sess] || "#999";
    },
    [
      activeNode,
      highlightSession,
      sessionColors,
      neighborMap,
      searchHighlightIds,
      dayActiveTalkIds,
    ]
  );

  const linkColor = useCallback(
    (link) => {
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      const sidStr = String(sid);
      const tidStr = String(tid);
      if (highlightSession) {
        const sNode = typeof link.source === "object" ? link.source : null;
        const tNode = typeof link.target === "object" ? link.target : null;
        if (sNode?.session !== highlightSession && tNode?.session !== highlightSession) {
          return "rgba(0,0,0,0.02)";
        }
      }
      if (dayActiveTalkIds != null) {
        const sOk = dayActiveTalkIds.has(sidStr);
        const tOk = dayActiveTalkIds.has(tidStr);
        if (!sOk && !tOk) return "rgba(0,0,0,0.02)";
        if (!sOk || !tOk) return "rgba(0,0,0,0.04)";
      }
      if (activeNode) {
        if (sid === activeNode.id || tid === activeNode.id) return "rgba(50,50,50,0.5)";
        return "rgba(0,0,0,0.02)";
      }
      if (searchHighlightIds != null) {
        const sIn = searchHighlightIds.has(sidStr);
        const tIn = searchHighlightIds.has(tidStr);
        if (sIn && tIn) return "rgba(50,50,50,0.22)";
        if (sIn || tIn) return "rgba(50,50,50,0.1)";
        return "rgba(0,0,0,0.02)";
      }
      return "rgba(0,0,0,0.12)";
    },
    [activeNode, highlightSession, searchHighlightIds, dayActiveTalkIds]
  );

  const linkWidth = useCallback(
    (link) => {
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      const sidStr = String(sid);
      const tidStr = String(tid);
      if (dayActiveTalkIds != null) {
        const sOk = dayActiveTalkIds.has(sidStr);
        const tOk = dayActiveTalkIds.has(tidStr);
        if (!sOk || !tOk) return 0.35;
      }
      if (activeNode) {
        if (sid === activeNode.id || tid === activeNode.id) return 1.5;
      }
      if (searchHighlightIds != null) {
        const sIn = searchHighlightIds.has(sidStr);
        const tIn = searchHighlightIds.has(tidStr);
        if (sIn && tIn) return 1;
      }
      return 0.5;
    },
    [activeNode, searchHighlightIds, dayActiveTalkIds]
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

  const nodeCanvasObject = useCallback((node, ctx) => {
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
    }
  }, [nodeColor, activeNode]);

  const onRenderFramePost = useCallback(
    (ctx, globalScale) => {
      if (!activeNode) {
        tooltipHeartHitRef.current = null;
        return;
      }
      let viewport = null;
      const fg = fgRef.current;
      if (fg && typeof fg.screen2GraphCoords === "function") {
        const marginPx = 10;
        const w = graphDims.width;
        const h = graphDims.height;
        const x1 = Math.min(marginPx, w - marginPx);
        const x2 = Math.max(marginPx, w - marginPx);
        const y1 = Math.min(marginPx, h - marginPx);
        const y2 = Math.max(marginPx, h - marginPx);
        const tl = fg.screen2GraphCoords(x1, y1);
        const br = fg.screen2GraphCoords(x2, y2);
        viewport = {
          minX: Math.min(tl.x, br.x),
          maxX: Math.max(tl.x, br.x),
          minY: Math.min(tl.y, br.y),
          maxY: Math.max(tl.y, br.y),
        };
      }
      paintNetworkNodeTooltip(
        ctx,
        globalScale,
        activeNode,
        sessionColors,
        wrapText,
        viewport,
        tooltipHeartLiked,
        tooltipHeartHitRef
      );
    },
    [
      activeNode,
      sessionColors,
      wrapText,
      graphDims.width,
      graphDims.height,
      tooltipHeartLiked,
    ]
  );

  /** Tooltip heart is painted above nodes; clicks there still hit node/link targets underneath. */
  const tryTooltipHeartClick = useCallback(
    (ev) => {
      const hit = tooltipHeartHitRef.current;
      const fg = fgRef.current;
      if (
        !hit ||
        !fg ||
        typeof fg.screen2GraphCoords !== "function" ||
        !activeNode ||
        String(activeNode.id) !== String(hit.nodeId)
      ) {
        return false;
      }
      let sx = ev?.offsetX;
      let sy = ev?.offsetY;
      if (sx == null || sy == null) {
        const el = graphContainerRef.current;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        sx = ev.clientX - r.left;
        sy = ev.clientY - r.top;
      }
      const g = fg.screen2GraphCoords(sx, sy);
      if (
        g.x >= hit.minX &&
        g.x <= hit.maxX &&
        g.y >= hit.minY &&
        g.y <= hit.maxY
      ) {
        toggleLike(buildCartItemFromNetworkNode(activeNode, graphKind));
        return true;
      }
      return false;
    },
    [activeNode, graphKind, toggleLike]
  );

  const onBackgroundClick = useCallback(
    (ev) => {
      if (tryTooltipHeartClick(ev)) return;
      setSelectedNode(null);
      setHighlightSession(null);
    },
    [tryTooltipHeartClick]
  );

  const onNodeClick = useCallback(
    (node, ev) => {
      if (tryTooltipHeartClick(ev)) return;
      setSelectedNode(selectedNode?.id === node.id ? null : node);
    },
    [tryTooltipHeartClick, selectedNode]
  );

  const onLinkClick = useCallback(
    (_link, ev) => {
      tryTooltipHeartClick(ev);
    },
    [tryTooltipHeartClick]
  );

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  if (!rawData || !graphData) {
    return <div className="loading">Loading network...</div>;
  }

  const sessionList = rawData.sessionOrder.map((label) => [label, rawData.colors[label]]);

  return (
    <div className={embedded ? "network-embedded-root" : "app"}>
      <div className="graph-container" ref={graphContainerRef}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={graphDims.width}
          height={graphDims.height}
          nodeColor={nodeColor}
          nodeCanvasObject={nodeCanvasObject}
          onRenderFramePost={onRenderFramePost}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onNodeHover={setHoveredNode}
          onNodeClick={onNodeClick}
          onLinkClick={onLinkClick}
          onBackgroundClick={onBackgroundClick}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          cooldownTicks={300}
          warmupTicks={100}
          backgroundColor="#ffffff"
        />
        <div className={`title-bar${embedded ? " title-bar-embedded" : ""}`}>
          {!embedded ? (
            <img src={import.meta.env.BASE_URL + "netsci2026_logo.png"} alt="NetSci 2026" />
          ) : null}
          <div className="title-text">
            <h1>Talk Network</h1>
            <p>Edges connect talks with similar topics</p>
          </div>
        </div>
        {!embedded && onBack ? (
          <button type="button" className="back-btn" onClick={onBack}>
            Back to program
          </button>
        ) : null}
      </div>
      {!embedded ? (
        <div className="sidebar">
          <div className="legend-panel">
            <h3>Sessions</h3>
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
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
