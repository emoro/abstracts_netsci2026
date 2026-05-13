import { cartItemKey } from "./sessionCartStorage";

export const DAY_FILTER_ALL = "all";

/** Split session label from program CSV (em dash or ` - `). */
export function splitSessionLabel(full) {
  const s = String(full || "").trim();
  let idx = s.indexOf("—");
  let sepLen = 1;
  if (idx === -1) {
    idx = s.indexOf(" - ");
    sepLen = 3;
  }
  if (idx === -1) return { code: s, name: "" };
  return { code: s.slice(0, idx).trim(), name: s.slice(idx + sepLen).trim() };
}

/** Parse `days=Jun%203,Jun%204` from URL; returns [] if invalid or empty. */
export function parseDaysQueryParam(daysParam, allDays) {
  if (!daysParam || !allDays?.length) return [];
  const parts = daysParam.split(",").map((p) => {
    try {
      return decodeURIComponent(p.trim());
    } catch {
      return p.trim();
    }
  });
  const valid = parts.filter((d) => allDays.includes(d));
  return valid.sort((a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b));
}

export function parseTimeMinutes(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function indexProgram(program) {
  const talkById = {};
  const sessionById = {};
  for (const session of program.sessions || []) {
    sessionById[session.id] = session;
  }
  for (const talk of program.talks || []) {
    talkById[talk.id] = talk;
  }
  return { talkById, sessionById };
}

export function parseProgramDayKey(day) {
  const match = String(day || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

const PROGRAM_DAY_KEY_RE = /^([A-Za-z]{3})\s+(\d{1,2})$/;

const MONTH_ABBR_TO_INDEX = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
});

function inferProgramYear(meta) {
  const s = meta?.builtAt || meta?.title;
  if (s && typeof s === "string") {
    const y = Number(s.match(/\b(20\d{2})\b/)?.[1]);
    if (Number.isFinite(y)) return y;
  }
  return 2026;
}

/** e.g. `Jun 3` → `Wed, Jun 3` (weekday + month/day; year from meta when possible). */
export function formatProgramDayShortLabel(dayKey, program) {
  const key = String(dayKey || "").trim();
  const m = key.match(PROGRAM_DAY_KEY_RE);
  if (!m) return key;
  const monRaw = m[1].slice(0, 3);
  const monAbbr = monRaw.charAt(0).toUpperCase() + monRaw.slice(1, 3).toLowerCase();
  const dayNum = Number(m[2]);
  const monthIdx = MONTH_ABBR_TO_INDEX[monAbbr];
  const year = inferProgramYear(program?.meta);
  if (monthIdx == null || !Number.isFinite(dayNum)) return key;
  const d = new Date(year, monthIdx, dayNum);
  if (d.getMonth() !== monthIdx) return key;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  return `${weekday}, ${monAbbr} ${dayNum}`;
}

export function getParallelSessionDays(program) {
  const seen = new Set();
  const days = [];
  for (const session of program.sessions || []) {
    const day = session.day;
    if (!day || seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }
  days.sort((a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b));
  return days;
}

/** Unique calendar days from parallel sessions and posters (sidebar checkboxes). */
export function getUnionProgramDays(program) {
  const seen = new Set();
  const days = [];
  for (const session of program.sessions || []) {
    const day = session.day;
    if (day && !seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  for (const p of program.posters || []) {
    const day = p.day;
    if (day && !seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  for (const t of program.lightningTalks || []) {
    const day = t.day;
    if (day && !seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  days.sort((a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b));
  return days;
}

export function getLightningDays(program) {
  const seen = new Set();
  const days = [];
  for (const t of program.lightningTalks || []) {
    const day = t.day;
    if (!day || seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }
  days.sort((a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b));
  return days;
}

export function indexLightning(program) {
  const talkById = {};
  const sessionById = {};
  for (const session of program.lightningSessions || []) {
    sessionById[session.id] = session;
  }
  for (const talk of program.lightningTalks || []) {
    talkById[talk.id] = talk;
  }
  return { talkById, sessionById };
}

export function filterLightningProgram(program, query) {
  const tokens = parseSearchQueryTokens(query);
  if (!tokens.length) return null;
  const sessionIds = new Set();
  const talkIds = new Set();
  for (const talk of program.lightningTalks || []) {
    const session = (program.lightningSessions || []).find((s) => s.id === talk.sessionId);
    const haystack = [
      talk.title,
      talk.authors,
      talk.speaker,
      talk.abstract,
      talk.topic,
      talk.sessionCode,
      talk.sessionTitle,
      session?.label,
      session?.code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystackMatchesSearchTokens(haystack, tokens)) {
      talkIds.add(talk.id);
      sessionIds.add(talk.sessionId);
    }
  }
  for (const session of program.lightningSessions || []) {
    const haystack = [session.label, session.title, session.code, session.topic]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystackMatchesSearchTokens(haystack, tokens)) sessionIds.add(session.id);
  }
  return { sessionIds, talkIds };
}

/** Unique `day` values from posters only (for poster-tab filters). */
export function getPosterDays(program) {
  const seen = new Set();
  const days = [];
  for (const p of program.posters || []) {
    const day = p.day;
    if (!day || seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }
  days.sort((a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b));
  return days;
}

export function formatTimeMinutes(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

/**
 * Parse a search string into OR tokens: `"exact phrase"` (substring) or bare
 * words (substring). Whitespace separates OR terms; quotes group a phrase.
 * @returns {string[]} lowercased substring needles
 */
export function parseSearchQueryTokens(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      i++;
      let buf = "";
      while (i < s.length && s[i] !== '"') {
        buf += s[i];
        i++;
      }
      if (i < s.length && s[i] === '"') i++;
      const text = buf.trim().toLowerCase();
      if (text) tokens.push(text);
    } else {
      let buf = "";
      while (i < s.length && !/\s/.test(s[i]) && s[i] !== '"') {
        buf += s[i];
        i++;
      }
      const text = buf.trim().toLowerCase();
      if (text) tokens.push(text);
    }
  }
  return tokens;
}

function haystackMatchesSearchTokens(haystackLower, tokens) {
  return tokens.some((t) => haystackLower.includes(t));
}

/** True if query is empty, or any OR token matches the joined parts (same rules as program search). */
export function matchesProgramSearch(parts, query) {
  const tokens = parseSearchQueryTokens(query);
  if (!tokens.length) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystackMatchesSearchTokens(haystack, tokens);
}

export function filterProgram(program, query) {
  const tokens = parseSearchQueryTokens(query);
  if (!tokens.length) return null;
  const sessionIds = new Set();
  const talkIds = new Set();
  for (const talk of program.talks || []) {
    const session = (program.sessions || []).find((s) => s.id === talk.sessionId);
    const haystack = [
      talk.title,
      talk.authors,
      talk.speaker,
      talk.abstract,
      talk.topic,
      talk.sessionCode,
      talk.sessionTitle,
      session?.label,
      session?.code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystackMatchesSearchTokens(haystack, tokens)) {
      talkIds.add(talk.id);
      sessionIds.add(talk.sessionId);
    }
  }
  for (const session of program.sessions || []) {
    const haystack = [session.label, session.title, session.code, session.topic]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystackMatchesSearchTokens(haystack, tokens)) sessionIds.add(session.id);
  }
  return { sessionIds, talkIds };
}

/** Filter posters by the same OR / quoted phrase search rules as `filterProgram`. */
export function filterPosters(posterList, query) {
  const tokens = parseSearchQueryTokens(query);
  if (!tokens.length) return null;
  const out = [];
  for (const p of posterList || []) {
    const haystack = [
      p.title,
      p.authors,
      p.speaker,
      p.abstract,
      p.day,
      p.time,
      p.posterNumber,
      p.posterType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystackMatchesSearchTokens(haystack, tokens)) out.push(p);
  }
  return out;
}

export function readProgramQuery() {
  const params = new URLSearchParams(window.location.search);
  const tabRaw = params.get("tab");
  let tab = "parallel";
  if (tabRaw === "posters") tab = "posters";
  else if (tabRaw === "lightning") tab = "lightning";
  else if (tabRaw === "myprogram") tab = "myprogram";
  return {
    days: params.get("days"),
    day: params.get("day"),
    session: params.get("session"),
    talk: params.get("talk"),
    poster: params.get("poster"),
    tab,
  };
}

export function writeProgramQuery({ selectedDays, allDays, session, talk, poster, tab }) {
  const params = new URLSearchParams();
  const allSelected =
    allDays?.length &&
    selectedDays?.length === allDays.length &&
    allDays.every((d) => selectedDays.includes(d));
  if (!allSelected && selectedDays?.length) {
    params.set("days", selectedDays.map((d) => encodeURIComponent(d)).join(","));
  }
  if (session) params.set("session", session);
  if (talk) params.set("talk", talk);
  if (poster) params.set("poster", poster);
  if (tab && tab !== "parallel") params.set("tab", tab);
  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", url);
}

function sessionTalkEndMinutes(talk, session, orderedSameSession) {
  const idx = orderedSameSession.findIndex((t) => String(t.id) === String(talk.id));
  if (idx === -1) return null;
  if (idx + 1 < orderedSameSession.length) {
    return parseTimeMinutes(orderedSameSession[idx + 1].startTime);
  }
  return parseTimeMinutes(session.endTime);
}

/**
 * Half-open interval [start, end) in minutes from midnight for a My program cart row.
 * Used to detect time overlaps between saved parallel talks, lightning talks, and posters.
 */
export function getMyProgramItemIntervalMinutes(item, program) {
  if (!item || !program) return null;
  const day = String(item.day || "").trim();
  if (!day) return null;
  const kind = item.kind;

  if (kind === "parallel") {
    const talk = (program.talks || []).find((t) => String(t.id) === String(item.id));
    if (!talk) return null;
    const st = String(talk.startTime || "").trim();
    if (!st) return null;
    const start = parseTimeMinutes(st);
    const session = (program.sessions || []).find((s) => s.id === talk.sessionId);
    let end;
    if (session) {
      const ordered = (program.talks || [])
        .filter((t) => t.sessionId === session.id)
        .sort((a, b) => parseTimeMinutes(a.startTime) - parseTimeMinutes(b.startTime));
      end = sessionTalkEndMinutes(talk, session, ordered);
    } else {
      end = start + 15;
    }
    if (end == null || !Number.isFinite(end)) end = start + 15;
    if (end <= start) end = start + 15;
    return { start, end };
  }

  if (kind === "lightning") {
    const talk = (program.lightningTalks || []).find((t) => String(t.id) === String(item.id));
    if (!talk) return null;
    const st = String(talk.startTime || "").trim();
    if (!st) return null;
    const start = parseTimeMinutes(st);
    const session = (program.lightningSessions || []).find((s) => s.id === talk.sessionId);
    let end;
    if (session) {
      const ordered = (program.lightningTalks || [])
        .filter((t) => t.sessionId === session.id)
        .sort((a, b) => parseTimeMinutes(a.startTime) - parseTimeMinutes(b.startTime));
      end = sessionTalkEndMinutes(talk, session, ordered);
    } else {
      end = start + 3;
    }
    if (end == null || !Number.isFinite(end)) end = start + 3;
    if (end <= start) end = start + 3;
    return { start, end };
  }

  if (kind === "poster") {
    const poster = (program.posters || []).find((p) => String(p.id) === String(item.id));
    if (!poster) return null;
    const timeStr = String(poster.time || item.time || "").trim();
    if (!timeStr) return null;
    const start = parseTimeMinutes(timeStr);
    let end = null;
    for (const ev of program.agenda || []) {
      if (ev.day === poster.day && String(ev.startTime || "").trim() === timeStr) {
        const e = parseTimeMinutes(String(ev.endTime || ""));
        if (Number.isFinite(e) && e > start) end = e;
        break;
      }
    }
    if (end == null) end = start + 135;
    if (end <= start) end = start + 60;
    return { start, end };
  }

  return null;
}

/**
 * @returns {Set<string>} keys `kind:id` (see `cartItemKey`) for items that overlap another saved item on the same day.
 */
export function computeOverlappingMyProgramKeys(items, program) {
  const keyed = [];
  for (const it of items || []) {
    const intv = getMyProgramItemIntervalMinutes(it, program);
    if (!intv) continue;
    keyed.push({
      key: cartItemKey(it.kind, it.id),
      day: String(it.day || "").trim(),
      start: intv.start,
      end: intv.end,
    });
  }
  const out = new Set();
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i];
      const b = keyed[j];
      if (a.day !== b.day) continue;
      if (a.start < b.end && b.start < a.end) {
        out.add(a.key);
        out.add(b.key);
      }
    }
  }
  return out;
}
