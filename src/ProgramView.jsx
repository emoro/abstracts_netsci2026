import { useCallback, useMemo } from "react";
import NetworkView from "./NetworkView";
import { useProgramCart } from "./ProgramCartContext.jsx";
import {
  computeOverlappingMyProgramKeys,
  filterLightningProgram,
  filterPosters,
  filterProgram,
  formatProgramDayShortLabel,
  indexLightning,
  indexProgram,
  parseProgramDayKey,
  parseTimeMinutes,
  splitSessionLabel,
} from "./programUtils";
import { cartItemKey } from "./sessionCartStorage";

function TalkDrawerSessionLine({ session }) {
  const accent = session?.color || "#c8352e";
  if (!session) {
    return (
      <p className="talk-drawer-session-line">
        <span className="talk-drawer-session-em" style={{ color: accent }}>
          —
        </span>
      </p>
    );
  }
  const label = String(session.label || "").trim();
  let code = "";
  let name = "";
  if (label) {
    const parts = splitSessionLabel(label);
    code = parts.code;
    name = parts.name;
  } else {
    code = session.code || "";
    name = session.title || "";
  }
  if (code && name) {
    return (
      <p className="talk-drawer-session-line">
        <span className="talk-drawer-session-em" style={{ color: accent }}>
          {code}
        </span>
        <span className="talk-drawer-session-sep"> - </span>
        <span className="talk-drawer-session-em" style={{ color: accent }}>
          {name}
        </span>
      </p>
    );
  }
  const single = code || name || label || "—";
  return (
    <p className="talk-drawer-session-line">
      <span className="talk-drawer-session-em" style={{ color: accent }}>
        {single}
      </span>
    </p>
  );
}

function sessionLabelForCart(session) {
  if (!session) return "";
  const label = String(session.label || "").trim();
  if (label) return label;
  const code = session.code || "";
  const title = session.title || "";
  if (code && title) return `${code} - ${title}`;
  return code || title || "";
}

function buildParallelCartItem(talk, session) {
  return {
    kind: "parallel",
    id: String(talk.id),
    title: talk.title || "",
    day: talk.day || "",
    time: talk.startTime || "",
    speaker: String(talk.speaker || "").trim(),
    sessionLabel: sessionLabelForCart(session),
  };
}

function buildLightningCartItem(talk, session) {
  return {
    kind: "lightning",
    id: String(talk.id),
    title: talk.title || "",
    day: talk.day || "",
    time: talk.startTime || "",
    speaker: String(talk.speaker || "").trim(),
    sessionLabel: sessionLabelForCart(session),
  };
}

function buildPosterCartItem(poster) {
  return {
    kind: "poster",
    id: String(poster.id),
    title: poster.title || "",
    day: poster.day || "",
    time: poster.time || "",
    speaker: String(poster.speaker || "").trim(),
    sessionLabel: `${poster.posterType || "Poster"} #${poster.posterNumber || "—"}`,
  };
}

function sortCartExport(a, b) {
  const da = parseProgramDayKey(a.day) - parseProgramDayKey(b.day);
  if (da !== 0) return da;
  const ta = parseTimeMinutes(a.time) - parseTimeMinutes(b.time);
  if (ta !== 0) return ta;
  const k = String(a.kind).localeCompare(String(b.kind));
  if (k !== 0) return k;
  return String(a.id).localeCompare(String(b.id));
}

/** Feather-style heart; same path for outline (stroke) and fill. */
const HEART_PATH =
  "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

function HeartIcon({ filled, className = "" }) {
  return (
    <svg
      className={`program-heart-svg${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d={HEART_PATH}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={filled ? 0 : 1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ProgramLikeButton({ liked, onToggle, label }) {
  return (
    <button
      type="button"
      className={`program-like-btn${liked ? " program-like-btn-on" : ""}`}
      aria-pressed={liked}
      aria-label={
        liked ? `Remove from My program: ${label}` : `Add to My program: ${label}`
      }
      title={liked ? "Remove from My program" : "Add to My program"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <HeartIcon filled={liked} />
    </button>
  );
}

function MyProgramOverlapBadge() {
  return (
    <span className="program-myprogram-overlap-badge" title="Overlaps another saved item in time">
      <svg
        className="program-myprogram-overlap-icon"
        viewBox="0 0 24 24"
        width="15"
        height="15"
        aria-hidden
        focusable="false"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinejoin="round"
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          d="M12 9v4M12 17h.01"
        />
      </svg>
      <span>Overlap</span>
    </span>
  );
}

function groupMyProgramByDay(items) {
  const map = new Map();
  for (const it of items) {
    const day = it.day || "";
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(it);
  }
  const days = [...map.keys()].sort(
    (a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b)
  );
  for (const d of days) {
    map.get(d).sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));
  }
  return days.map((day) => ({ day, items: map.get(day) }));
}

function ProgramMyProgramPanel({ program, visibleItems }) {
  const { removeItem } = useProgramCart();

  const kindLabel = (k) =>
    k === "poster" ? "Poster" : k === "lightning" ? "Lightning" : "Parallel";

  const byDay = useMemo(() => groupMyProgramByDay(visibleItems), [visibleItems]);
  const overlapKeys = useMemo(
    () => computeOverlappingMyProgramKeys(visibleItems, program),
    [visibleItems, program]
  );

  return (
    <>
      {byDay.map(({ day, items: dayItems }) => (
        <article
          key={day || "unknown"}
          className="program-session-card"
          style={{ borderLeftColor: "#c8352e" }}
        >
          <div className="program-session-card-head">
            <div>
              <h3>{day ? formatProgramDayShortLabel(day, program) : "Saved items"}</h3>
              <p className="program-session-when">
                {dayItems.length} {dayItems.length === 1 ? "saved item" : "saved items"}
              </p>
            </div>
          </div>
          <ol className="program-session-talks program-session-talks-inline">
            {dayItems.map((it) => {
              const overlaps = overlapKeys.has(cartItemKey(it.kind, it.id));
              return (
              <li key={`${it.kind}:${it.id}`}>
                <div
                  className={`program-talk-row-shell${
                    overlaps ? " program-myprogram-row-shell-overlap" : ""
                  }`}
                >
                  <div className="program-talk-row program-myprogram-row-readonly">
                    <span className="program-talk-time">
                      {it.time || "—"}
                      <span className="program-myprogram-kind-tag">{kindLabel(it.kind)}</span>
                    </span>
                    <span className="program-talk-main">
                      <span className="program-myprogram-title-line">
                        <span className="program-talk-title">{it.title}</span>
                        {overlaps ? <MyProgramOverlapBadge /> : null}
                      </span>
                      {it.speaker ? (
                        <span className="program-talk-speaker">{it.speaker}</span>
                      ) : null}
                      {it.sessionLabel ? (
                        <span className="program-myprogram-session-meta">{it.sessionLabel}</span>
                      ) : null}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="program-cart-remove program-myprogram-remove"
                    onClick={() => removeItem(it.kind, it.id)}
                    aria-label={`Remove ${it.title}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
              );
            })}
          </ol>
        </article>
      ))}
    </>
  );
}

function TalkDrawer({ talk, session, poster, program, onClose, cartItem, cartLiked, onToggleCartLike }) {
  const accent = poster ? "#8e44ad" : session?.color || "#c8352e";
  const effectiveTalk = poster
    ? {
        id: poster.id,
        title: poster.title,
        authors: poster.authors,
        abstract: poster.abstract,
        speaker: poster.speaker,
        day: poster.day,
        startTime: poster.time,
      }
    : talk;
  const effectiveSession = poster
    ? {
        color: accent,
        label: `${poster.posterType || "Poster"} — #${poster.posterNumber || "—"}`,
      }
    : session;

  if (!effectiveTalk) return null;
  const dayPart = effectiveTalk.day ? formatProgramDayShortLabel(effectiveTalk.day, program) : "";
  const metaLine2 = [dayPart, effectiveTalk.startTime].filter(Boolean).join(" - ");
  const authorsStr = String(effectiveTalk.authors || "");
  const speaker =
    String(effectiveTalk.speaker || "").trim() ||
    authorsStr.split(",")[0]?.replace(/\*/g, "").trim() ||
    "";
  const authorLine = speaker || authorsStr;

  return (
    <div className="talk-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="talk-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="talk-drawer-title"
      >
        <button type="button" className="talk-drawer-close" onClick={onClose}>
          Close
        </button>
        <div className="talk-drawer-card">
          <div className="talk-drawer-accent" style={{ backgroundColor: accent }} aria-hidden />
          <div className="talk-drawer-body">
            <TalkDrawerSessionLine session={effectiveSession} />
            {metaLine2 ? <p className="talk-drawer-meta-line2">{metaLine2}</p> : null}
            <h2 id="talk-drawer-title" className="talk-drawer-title">
              {effectiveTalk.title}
            </h2>
            {authorLine ? <p className="talk-drawer-author">{authorLine}</p> : null}
            {cartItem && onToggleCartLike ? (
              <div className="talk-drawer-like-wrap">
                <button
                  type="button"
                  className={`talk-drawer-like-btn${cartLiked ? " talk-drawer-like-btn-on" : ""}`}
                  aria-pressed={cartLiked}
                  onClick={() => onToggleCartLike()}
                >
                  <HeartIcon filled={cartLiked} className="talk-drawer-heart-icon" />
                  <span>{cartLiked ? "In My program" : "Add to My program"}</span>
                </button>
              </div>
            ) : null}
            {effectiveTalk.abstract ? (
              <p className="talk-drawer-abstract">{effectiveTalk.abstract}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function talksForSession(session, talkById, filter) {
  const ordered = (session.talkIds || [])
    .map((id) => talkById[id])
    .filter(Boolean)
    .sort((a, b) => parseTimeMinutes(a.startTime) - parseTimeMinutes(b.startTime));
  if (!filter) return ordered;
  return ordered.filter((talk) => filter.talkIds.has(talk.id));
}

function groupPostersIntoSlots(posters) {
  const map = new Map();
  for (const p of posters) {
    const day = p.day || "";
    const time = p.time || "";
    const key = `${day}|||${time}`;
    if (!map.has(key)) {
      map.set(key, { day, time, posters: [] });
    }
    map.get(key).posters.push(p);
  }
  const slots = Array.from(map.values());
  slots.sort(
    (a, b) =>
      parseProgramDayKey(a.day) - parseProgramDayKey(b.day) ||
      parseTimeMinutes(a.time) - parseTimeMinutes(b.time) ||
      (a.posters[0]?.posterNumber || "").localeCompare(b.posters[0]?.posterNumber || "")
  );
  for (const s of slots) {
    s.posters.sort(
      (a, b) =>
        parseTimeMinutes(a.time) - parseTimeMinutes(b.time) ||
        String(a.posterNumber || "").localeCompare(String(b.posterNumber || ""), undefined, {
          numeric: true,
        }) ||
        (a.title || "").localeCompare(b.title || "")
    );
  }
  return slots;
}

export default function ProgramView({
  program,
  programTab,
  onProgramTabChange,
  parallelDisplayMode,
  onParallelDisplayModeChange,
  posterDisplayMode,
  onPosterDisplayModeChange,
  lightningDisplayMode,
  onLightningDisplayModeChange,
  calendarDays,
  posterDays = [],
  lightningDays = [],
  selectedDays,
  onToggleDay,
  search,
  onSearchChange,
  searchMatchIds,
  selectedTalkId,
  onSelectTalk,
  onClearTalk,
  selectedPosterId,
  onSelectPoster,
  onClearPoster,
  networkFocusTalkId,
  posterNetworkFocusId,
  lightningNetworkFocusId,
  graphTalkIds,
  posterGraphNodeIds,
  lightningGraphNodeIds,
}) {
  const { talkById, sessionById } = useMemo(() => indexProgram(program), [program]);
  const { talkById: lightningTalkById, sessionById: lightningSessionById } = useMemo(
    () => indexLightning(program),
    [program]
  );
  const filter = useMemo(() => filterProgram(program, search), [program, search]);
  const lightningFilter = useMemo(
    () => filterLightningProgram(program, search),
    [program, search]
  );
  const selectedSet = useMemo(() => new Set(selectedDays), [selectedDays]);

  const isPosters = programTab === "posters";
  const isLightning = programTab === "lightning";
  const isMyProgram = programTab === "myprogram";
  const sidebarDayList = useMemo(() => {
    if (isPosters) return posterDays.length ? posterDays : calendarDays;
    if (isLightning) return lightningDays.length ? lightningDays : calendarDays;
    return calendarDays;
  }, [isPosters, isLightning, posterDays, lightningDays, calendarDays]);

  /** Selected days restricted to poster days (posters tab). */
  const daysForPosterContent = useMemo(() => {
    if (!isPosters) return selectedDays;
    const allow = new Set(posterDays);
    return selectedDays.filter((d) => allow.has(d));
  }, [isPosters, posterDays, selectedDays]);

  const posterDaySet = useMemo(() => new Set(daysForPosterContent), [daysForPosterContent]);

  const sessionsFiltered = useMemo(() => {
    if (!selectedDays.length) return [];
    const sessions = program.sessions || [];
    return sessions
      .filter((session) => selectedSet.has(session.day))
      .sort(
        (a, b) =>
          parseProgramDayKey(a.day) - parseProgramDayKey(b.day) ||
          parseTimeMinutes(a.startTime) - parseTimeMinutes(b.startTime) ||
          (a.code || "").localeCompare(b.code || "")
      );
  }, [program, selectedDays, selectedSet]);

  const visibleSessions = useMemo(() => {
    return sessionsFiltered.filter((session) => {
      const talks = talksForSession(session, talkById, filter);
      return talks.length > 0;
    });
  }, [sessionsFiltered, talkById, filter]);

  const lightningSessionsFiltered = useMemo(() => {
    if (!selectedDays.length) return [];
    const ls = program.lightningSessions || [];
    return ls
      .filter((session) => selectedSet.has(session.day))
      .sort(
        (a, b) =>
          parseProgramDayKey(a.day) - parseProgramDayKey(b.day) ||
          parseTimeMinutes(a.startTime) - parseTimeMinutes(b.startTime) ||
          (a.code || "").localeCompare(b.code || "")
      );
  }, [program, selectedDays, selectedSet]);

  const visibleLightningSessions = useMemo(() => {
    return lightningSessionsFiltered.filter((session) => {
      const talks = talksForSession(session, lightningTalkById, lightningFilter);
      return talks.length > 0;
    });
  }, [lightningSessionsFiltered, lightningTalkById, lightningFilter]);

  const selectedTalk = (() => {
    if (!selectedTalkId) return null;
    if (isLightning) return lightningTalkById[selectedTalkId] || null;
    return talkById[selectedTalkId] || null;
  })();
  const selectedTalkSession = selectedTalk
    ? isLightning
      ? lightningSessionById[selectedTalk.sessionId] || null
      : sessionById[selectedTalk.sessionId] || null
    : null;

  const visibleTalkCount = useMemo(() => {
    return visibleSessions.reduce(
      (sum, session) => sum + talksForSession(session, talkById, filter).length,
      0
    );
  }, [visibleSessions, talkById, filter]);

  const visibleLightningTalkCount = useMemo(() => {
    return visibleLightningSessions.reduce(
      (sum, session) =>
        sum + talksForSession(session, lightningTalkById, lightningFilter).length,
      0
    );
  }, [visibleLightningSessions, lightningTalkById, lightningFilter]);

  /** Graph node ids whose talk is on a selected day (for network dimming). */
  const networkDayActiveTalkIds = useMemo(() => {
    if (!graphTalkIds || !program) return undefined;
    if (!selectedDays.length) return new Set();
    const daySet = new Set(selectedDays);
    const byId = {};
    for (const t of program.talks || []) {
      byId[String(t.id)] = t;
    }
    const active = new Set();
    for (const sid of graphTalkIds) {
      const talk = byId[sid];
      if (talk && daySet.has(talk.day)) active.add(sid);
    }
    return active;
  }, [program, graphTalkIds, selectedDays]);

  const posterById = useMemo(() => {
    const m = {};
    for (const p of program.posters || []) {
      m[String(p.id)] = p;
    }
    return m;
  }, [program.posters]);

  const posterSource = useMemo(() => {
    const pl = program.posters || [];
    if (!daysForPosterContent.length) return [];
    return pl.filter((p) => posterDaySet.has(p.day));
  }, [program.posters, daysForPosterContent, posterDaySet]);

  const visiblePostersFlat = useMemo(() => {
    const f = filterPosters(posterSource, search);
    return f ?? posterSource;
  }, [posterSource, search]);

  const visiblePosterSlots = useMemo(
    () => groupPostersIntoSlots(visiblePostersFlat),
    [visiblePostersFlat]
  );

  const visiblePosterCount = visiblePostersFlat.length;

  const networkDayActivePosterIds = useMemo(() => {
    if (!posterGraphNodeIds) return undefined;
    if (!daysForPosterContent.length) return new Set();
    const daySet = new Set(daysForPosterContent);
    const active = new Set();
    for (const sid of posterGraphNodeIds) {
      const p = posterById[sid];
      if (p && daySet.has(p.day)) active.add(sid);
    }
    return active;
  }, [posterGraphNodeIds, daysForPosterContent, posterById]);

  const networkDayActiveLightningIds = useMemo(() => {
    if (!lightningGraphNodeIds) return undefined;
    if (!selectedDays.length) return new Set();
    const daySet = new Set(selectedDays);
    const byId = {};
    for (const t of program.lightningTalks || []) {
      byId[String(t.id)] = t;
    }
    const active = new Set();
    for (const sid of lightningGraphNodeIds) {
      const talk = byId[sid];
      if (talk && daySet.has(talk.day)) active.add(sid);
    }
    return active;
  }, [program, lightningGraphNodeIds, selectedDays]);

  const displayMode = isPosters
    ? posterDisplayMode
    : isLightning
      ? lightningDisplayMode
      : parallelDisplayMode;
  const onDisplayModeChange = isPosters
    ? onPosterDisplayModeChange
    : isLightning
      ? onLightningDisplayModeChange
      : onParallelDisplayModeChange;

  const showDayOnSession = selectedDays.length > 1;
  const showDayOnPosterSlot = daysForPosterContent.length > 1;

  const selectedPoster = selectedPosterId ? posterById[String(selectedPosterId)] : null;

  const { count, isLiked, toggleLike, items: cartItems, clearCart } = useProgramCart();

  const myProgramVisibleItems = useMemo(() => {
    if (!isMyProgram) return [];
    return [...cartItems].sort(sortCartExport);
  }, [isMyProgram, cartItems]);

  const downloadMyProgramPdfClick = useCallback(async () => {
    const sorted = [...cartItems].sort(sortCartExport);
    try {
      const { downloadMyProgramPdf } = await import("./myProgramPdf");
      await downloadMyProgramPdf(program, sorted);
    } catch (err) {
      console.error("My program PDF failed:", err);
      window.alert(
        `Could not download PDF: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [program, cartItems]);

  const drawerCartItem = useMemo(() => {
    if (selectedPoster) return buildPosterCartItem(selectedPoster);
    if (!selectedTalk) return null;
    if (isLightning) return buildLightningCartItem(selectedTalk, selectedTalkSession);
    return buildParallelCartItem(selectedTalk, selectedTalkSession);
  }, [selectedPoster, selectedTalk, selectedTalkSession, isLightning]);

  return (
    <div className="program">
      <header className="program-header">
        <div className="program-shell-inner program-header-inner">
          <img
            src={import.meta.env.BASE_URL + "netsci2026_logo.png"}
            alt="NetSci 2026"
            className="landing-logo"
          />
          <div className="program-header-text">
            <h1>NetSci 2026 Program</h1>
            <p>
              {program.talks.length} talks · {program.sessions.length} parallel sessions
            </p>
          </div>
        </div>
      </header>

      <div className="program-app-tabs">
        <div className="program-shell-inner program-app-tabs-inner" role="tablist" aria-label="Program sections">
          <button
            type="button"
            role="tab"
            aria-selected={programTab === "parallel"}
            className={`program-app-tab${programTab === "parallel" ? " active" : ""}`}
            onClick={() => onProgramTabChange("parallel")}
          >
            Parallel sessions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={programTab === "posters"}
            className={`program-app-tab${programTab === "posters" ? " active" : ""}`}
            onClick={() => onProgramTabChange("posters")}
          >
            Posters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={programTab === "lightning"}
            className={`program-app-tab${programTab === "lightning" ? " active" : ""}`}
            onClick={() => onProgramTabChange("lightning")}
          >
            Lightning talks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={programTab === "myprogram"}
            className={`program-app-tab${programTab === "myprogram" ? " active" : ""}`}
            onClick={() => onProgramTabChange("myprogram")}
          >
            My program
            {count > 0 ? (
              <span className="program-app-tab-badge" aria-hidden>
                {count}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="program-shell-inner program-parallel-layout">
        <aside
          className="program-sidebar"
          {...(isMyProgram
            ? { "aria-label": "My program" }
            : { "aria-labelledby": "program-filter-legend-title" })}
        >
          {!isMyProgram ? (
            <>
              <p id="program-filter-legend-title" className="program-sidebar-title">
                Filter
              </p>
              <fieldset className="program-filter-fieldset">
                <legend className="program-filter-legend">Days</legend>
                <ul className="program-day-checkboxes">
                  {sidebarDayList.map((day) => (
                    <li key={day}>
                      <label className="program-day-checkbox-label">
                        <input
                          type="checkbox"
                          className="program-day-checkbox"
                          checked={selectedSet.has(day)}
                          onChange={() => onToggleDay(day)}
                        />
                        <span>{formatProgramDayShortLabel(day, program)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <label className="program-search program-search-sidebar">
                <span className="program-search-sidebar-label">Search</span>
                <input
                  type="search"
                  placeholder='Search… "exact phrase" or word1 word2 (any match)'
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </label>
            </>
          ) : null}
          {!isMyProgram ? (
            <div className="program-sidebar-view">
              <p className="program-sidebar-view-label">View</p>
              <div
                className="program-parallel-mode-toggle program-sidebar-mode-toggle"
                role="group"
                aria-label={
                  isPosters ? "Poster view" : isLightning ? "Lightning view" : "Parallel view"
                }
              >
                <button
                  type="button"
                  className={displayMode === "list" ? "active" : ""}
                  aria-pressed={displayMode === "list"}
                  onClick={() => onDisplayModeChange("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={displayMode === "network" ? "active" : ""}
                  aria-pressed={displayMode === "network"}
                  onClick={() => onDisplayModeChange("network")}
                >
                  Network
                </button>
              </div>
            </div>
          ) : null}
          <p className="program-sidebar-counts" aria-live="polite">
            {isMyProgram ? (
              cartItems.length === 0 ? (
                <>Nothing saved</>
              ) : (
                <strong className="program-sidebar-myprogram-count">
                  {myProgramVisibleItems.length}{" "}
                  {myProgramVisibleItems.length === 1 ? "item" : "items"}
                </strong>
              )
            ) : isPosters ? (
              <>
                {visiblePosterSlots.length}{" "}
                {visiblePosterSlots.length === 1 ? "time slot" : "time slots"}
                {" · "}
                {visiblePosterCount} {visiblePosterCount === 1 ? "poster" : "posters"}
              </>
            ) : isLightning ? (
              <>
                {visibleLightningSessions.length}{" "}
                {visibleLightningSessions.length === 1 ? "session" : "sessions"}
                {" · "}
                {visibleLightningTalkCount}{" "}
                {visibleLightningTalkCount === 1 ? "talk" : "talks"}
              </>
            ) : (
              <>
                {visibleSessions.length}{" "}
                {visibleSessions.length === 1 ? "session" : "sessions"}
                {" · "}
                {visibleTalkCount} {visibleTalkCount === 1 ? "talk" : "talks"}
              </>
            )}
          </p>
          {isMyProgram ? (
            <p className="program-myprogram-note program-sidebar-myprogram-note">
              My program is saved in this browser on this device, so it stays after you close the
              tab. It is not synced to other browsers or devices. Clearing site data for this site
              will remove it.
            </p>
          ) : null}
          {isMyProgram ? (
            <div className="program-sidebar-myprogram-actions">
              <p className="program-sidebar-myprogram-hint">
                Download PDF includes every saved item in My program.
              </p>
              <button
                type="button"
                className="program-sidebar-action-btn program-sidebar-action-btn-muted"
                disabled={cartItems.length === 0}
                onClick={() => clearCart()}
              >
                Clear all
              </button>
              <button
                type="button"
                className="program-sidebar-action-btn"
                disabled={cartItems.length === 0}
                onClick={downloadMyProgramPdfClick}
              >
                Download PDF
              </button>
            </div>
          ) : null}
        </aside>

        <main className="program-parallel-main">
          {isMyProgram ? (
            cartItems.length === 0 ? (
              <p className="program-empty">
                Nothing saved yet. Tap the heart on a list row or use &quot;Add to My program&quot; in
                a talk detail.
              </p>
            ) : (
              <ProgramMyProgramPanel program={program} visibleItems={myProgramVisibleItems} />
            )
          ) : isPosters ? (
            displayMode === "list" ? (
              <>
                {daysForPosterContent.length === 0 ? (
                  <p className="program-empty">Select at least one day to see posters.</p>
                ) : visiblePosterSlots.length === 0 ? (
                  <p className="program-empty">
                    {search.trim()
                      ? "No posters match your search for the selected days."
                      : "No posters listed for the selected days."}
                  </p>
                ) : (
                  visiblePosterSlots.map((slot) => (
                    <article
                      key={`${slot.day}-${slot.time}`}
                      className="program-session-card"
                      style={{ borderLeftColor: "#8e44ad" }}
                    >
                      <div className="program-session-card-head">
                        <div>
                          <h3>Poster Session</h3>
                          <p className="program-session-when">
                            {showDayOnPosterSlot ? (
                              <>
                                <span className="program-session-day">
                                  {formatProgramDayShortLabel(slot.day, program)}
                                </span>
                                {" · "}
                              </>
                            ) : null}
                            {slot.time || "—"} - {slot.posters.length}{" "}
                            {slot.posters.length === 1 ? "poster" : "posters"}
                            {search.trim() ? " matching" : ""}
                          </p>
                        </div>
                      </div>
                      <ol className="program-session-talks program-session-talks-inline">
                        {slot.posters.map((p) => (
                          <li key={p.id}>
                            <div className="program-talk-row-shell">
                              <button
                                type="button"
                                className="program-talk-row"
                                onClick={() => onSelectPoster(p.id)}
                              >
                                <span className="program-talk-time">
                                  {p.posterNumber ? `#${p.posterNumber}` : "—"}
                                </span>
                                <span className="program-talk-main">
                                  <span className="program-talk-title">{p.title}</span>
                                  {p.speaker ? (
                                    <span className="program-talk-speaker">{p.speaker}</span>
                                  ) : null}
                                </span>
                              </button>
                              <ProgramLikeButton
                                liked={isLiked("poster", String(p.id))}
                                onToggle={() => toggleLike(buildPosterCartItem(p))}
                                label={p.title}
                              />
                            </div>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))
                )}
              </>
            ) : (
              <NetworkView
                embedded
                graphUrl={`${import.meta.env.BASE_URL}poster_graph_data.json`}
                focusTalkId={posterNetworkFocusId}
                searchHighlightIds={searchMatchIds}
                dayActiveTalkIds={networkDayActivePosterIds}
              />
            )
          ) : isLightning ? (
            displayMode === "list" ? (
              <>
                {selectedDays.length === 0 ? (
                  <p className="program-empty">Select at least one day to see lightning talks.</p>
                ) : visibleLightningSessions.length === 0 ? (
                  <p className="program-empty">
                    {lightningFilter
                      ? "No lightning talks match your search for the selected days."
                      : "No lightning sessions for the selected days."}
                  </p>
                ) : (
                  visibleLightningSessions.map((session) => {
                    const talks = talksForSession(session, lightningTalkById, lightningFilter);
                    return (
                      <article
                        key={session.id}
                        className="program-session-card"
                        style={{ borderLeftColor: session.color }}
                      >
                        <div className="program-session-card-head">
                          <div>
                            <p className="program-session-code">{session.code}</p>
                            <h3>{session.title}</h3>
                            <p className="program-session-when">
                              {showDayOnSession ? (
                                <>
                                  <span className="program-session-day">
                                    {formatProgramDayShortLabel(session.day, program)}
                                  </span>
                                  {" · "}
                                </>
                              ) : null}
                              {session.startTime}
                              {session.endTime && session.endTime !== session.startTime
                                ? ` – ${session.endTime}`
                                : ""}
                              {" · "}
                              {talks.length} {talks.length === 1 ? "talk" : "talks"}
                              {lightningFilter ? " matching" : ""}
                            </p>
                          </div>
                        </div>
                        <ol className="program-session-talks program-session-talks-inline">
                          {talks.map((talk) => (
                            <li key={talk.id}>
                              <div className="program-talk-row-shell">
                                <button
                                  type="button"
                                  className="program-talk-row"
                                  onClick={() => onSelectTalk(talk.id)}
                                >
                                  <span className="program-talk-time">{talk.startTime}</span>
                                  <span className="program-talk-main">
                                    <span className="program-talk-title">{talk.title}</span>
                                    {talk.speaker ? (
                                      <span className="program-talk-speaker">{talk.speaker}</span>
                                    ) : null}
                                  </span>
                                </button>
                                <ProgramLikeButton
                                  liked={isLiked("lightning", String(talk.id))}
                                  onToggle={() =>
                                    toggleLike(buildLightningCartItem(talk, session))
                                  }
                                  label={talk.title}
                                />
                              </div>
                            </li>
                          ))}
                        </ol>
                      </article>
                    );
                  })
                )}
              </>
            ) : (
              <NetworkView
                embedded
                graphUrl={`${import.meta.env.BASE_URL}lightning_graph_data.json`}
                focusTalkId={lightningNetworkFocusId}
                searchHighlightIds={searchMatchIds}
                dayActiveTalkIds={networkDayActiveLightningIds}
              />
            )
          ) : displayMode === "list" ? (
            <>
              {selectedDays.length === 0 ? (
                <p className="program-empty">Select at least one day to see sessions.</p>
              ) : visibleSessions.length === 0 ? (
                <p className="program-empty">
                  {filter
                    ? "No talks match your search for the selected days."
                    : "No parallel sessions."}
                </p>
              ) : (
                visibleSessions.map((session) => {
                  const talks = talksForSession(session, talkById, filter);
                  return (
                    <article
                      key={session.id}
                      className="program-session-card"
                      style={{ borderLeftColor: session.color }}
                    >
                      <div className="program-session-card-head">
                        <div>
                          <p className="program-session-code">{session.code}</p>
                          <h3>{session.title}</h3>
                          <p className="program-session-when">
                            {showDayOnSession ? (
                              <>
                                <span className="program-session-day">
                                  {formatProgramDayShortLabel(session.day, program)}
                                </span>
                                {" · "}
                              </>
                            ) : null}
                            {session.startTime}
                            {session.endTime && session.endTime !== session.startTime
                              ? ` – ${session.endTime}`
                              : ""}
                            {" · "}
                            {talks.length} {talks.length === 1 ? "talk" : "talks"}
                            {filter ? " matching" : ""}
                          </p>
                        </div>
                      </div>
                      <ol className="program-session-talks program-session-talks-inline">
                        {talks.map((talk) => (
                          <li key={talk.id}>
                            <div className="program-talk-row-shell">
                              <button
                                type="button"
                                className="program-talk-row"
                                onClick={() => onSelectTalk(talk.id)}
                              >
                                <span className="program-talk-time">{talk.startTime}</span>
                                <span className="program-talk-main">
                                  <span className="program-talk-title">{talk.title}</span>
                                  {talk.speaker ? (
                                    <span className="program-talk-speaker">{talk.speaker}</span>
                                  ) : null}
                                </span>
                              </button>
                              <ProgramLikeButton
                                liked={isLiked("parallel", String(talk.id))}
                                onToggle={() => toggleLike(buildParallelCartItem(talk, session))}
                                label={talk.title}
                              />
                            </div>
                          </li>
                        ))}
                      </ol>
                    </article>
                  );
                })
              )}
            </>
          ) : (
            <NetworkView
              embedded
              graphUrl={`${import.meta.env.BASE_URL}sessions_graph_data.json`}
              focusTalkId={networkFocusTalkId}
              searchHighlightIds={searchMatchIds}
              dayActiveTalkIds={networkDayActiveTalkIds}
            />
          )}
        </main>
      </div>

      <TalkDrawer
        talk={selectedTalk}
        session={selectedTalkSession}
        poster={selectedPoster}
        program={program}
        onClose={() => {
          if (selectedPosterId) onClearPoster();
          else onClearTalk();
        }}
        cartItem={drawerCartItem}
        cartLiked={
          drawerCartItem ? isLiked(drawerCartItem.kind, drawerCartItem.id) : false
        }
        onToggleCartLike={drawerCartItem ? () => toggleLike(drawerCartItem) : undefined}
      />
    </div>
  );
}
