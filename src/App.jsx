import { useState, useEffect, useMemo } from "react";
import ProgramView from "./ProgramView";
import { ProgramCartProvider } from "./ProgramCartContext.jsx";
import {
  DAY_FILTER_ALL,
  filterLightningProgram,
  filterPosters,
  filterProgram,
  getLightningDays,
  getPosterDays,
  getUnionProgramDays,
  parseDaysQueryParam,
  parseProgramDayKey,
  readProgramQuery,
  writeProgramQuery,
} from "./programUtils";
import "./App.css";

const PROGRAM_JSON_URL =
  import.meta.env.VITE_PROGRAM_JSON_URL?.trim() ||
  import.meta.env.BASE_URL + "program.json";

function initialSelectedDays(query, allDays) {
  if (!allDays.length) return [];
  const fromDays = parseDaysQueryParam(query.days || "", allDays);
  if (fromDays.length) return fromDays;
  if (query.day === DAY_FILTER_ALL) return [...allDays];
  if (query.day && allDays.includes(query.day)) return [query.day];
  return [...allDays];
}

function sortDayList(days) {
  return [...days].sort(
    (a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b)
  );
}

/** Keep days that exist in allowed; if none, default to all allowed days (sorted). */
function pickDaysForTab(seed, allowedList) {
  if (!allowedList.length) return [];
  const allow = new Set(allowedList);
  const hit = seed.filter((d) => allow.has(d));
  if (hit.length) return sortDayList(hit);
  return sortDayList([...allowedList]);
}

function daysTabKey(tab) {
  if (tab === "posters") return "posters";
  if (tab === "lightning") return "lightning";
  if (tab === "myprogram") return "myprogram";
  return "parallel";
}

function App() {
  const [program, setProgram] = useState(null);
  const [graphTalkIds, setGraphTalkIds] = useState(null);
  const [posterGraphNodeIds, setPosterGraphNodeIds] = useState(null);
  const [lightningGraphNodeIds, setLightningGraphNodeIds] = useState(null);
  const [programTab, setProgramTab] = useState("parallel");
  const [parallelDisplayMode, setParallelDisplayMode] = useState("list");
  const [posterDisplayMode, setPosterDisplayMode] = useState("list");
  const [lightningDisplayMode, setLightningDisplayMode] = useState("list");
  const [networkFocusTalkId, setNetworkFocusTalkId] = useState(null);
  const [daysByTab, setDaysByTab] = useState({
    parallel: [],
    posters: [],
    lightning: [],
    myprogram: [],
  });
  const [selectedTalkId, setSelectedTalkId] = useState(null);
  const [selectedPosterId, setSelectedPosterId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(PROGRAM_JSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProgram(data);
        const query = readProgramQuery();
        const allDays = getUnionProgramDays(data);
        const posterDayList = getPosterDays(data);
        const lightningDayList = getLightningDays(data);
        const tab = query.tab;
        const dayDomain =
          tab === "posters" && posterDayList.length
            ? posterDayList
            : tab === "lightning" && lightningDayList.length
              ? lightningDayList
              : allDays;
        const seed = initialSelectedDays(query, dayDomain);
        setDaysByTab({
          parallel: pickDaysForTab(seed, allDays),
          posters: pickDaysForTab(seed, posterDayList.length ? posterDayList : allDays),
          lightning: pickDaysForTab(seed, lightningDayList.length ? lightningDayList : allDays),
          myprogram: pickDaysForTab(seed, allDays),
        });
        setSelectedTalkId(query.talk || null);
        setSelectedPosterId(query.poster || null);
        setProgramTab(tab);
      })
      .catch((err) => console.error("Could not load program.json:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(import.meta.env.BASE_URL + "sessions_graph_data.json")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setGraphTalkIds(new Set((data.nodes || []).map((n) => String(n.id))));
      })
      .catch(() => setGraphTalkIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(import.meta.env.BASE_URL + "poster_graph_data.json")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPosterGraphNodeIds(new Set((data.nodes || []).map((n) => String(n.id))));
      })
      .catch(() => setPosterGraphNodeIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(import.meta.env.BASE_URL + "lightning_graph_data.json")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLightningGraphNodeIds(new Set((data.nodes || []).map((n) => String(n.id))));
      })
      .catch(() => setLightningGraphNodeIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, []);

  const calendarDays = useMemo(
    () => (program ? getUnionProgramDays(program) : []),
    [program]
  );

  const posterDays = useMemo(
    () => (program ? getPosterDays(program) : []),
    [program]
  );

  const lightningDays = useMemo(
    () => (program ? getLightningDays(program) : []),
    [program]
  );

  const selectedDays = useMemo(
    () => daysByTab[daysTabKey(programTab)] ?? [],
    [daysByTab, programTab]
  );

  /** Graph search highlights (all graph matches); day dimming is separate in ProgramView / NetworkView. */
  const searchMatchIds = useMemo(() => {
    if (!program) return null;
    if (programTab === "myprogram") return null;
    const q = search.trim();
    if (!q) return null;
    if (programTab === "posters") {
      if (posterGraphNodeIds == null) return null;
      const matched = filterPosters(program.posters || [], search);
      const list = matched ?? (program.posters || []);
      const out = new Set();
      for (const p of list) {
        const sid = String(p.id);
        if (posterGraphNodeIds.has(sid)) out.add(sid);
      }
      return out;
    }
    if (programTab === "lightning") {
      if (lightningGraphNodeIds == null) return null;
      const f = filterLightningProgram(program, search);
      const out = new Set();
      for (const id of f.talkIds) {
        const sid = String(id);
        if (lightningGraphNodeIds.has(sid)) out.add(sid);
      }
      return out;
    }
    if (graphTalkIds == null) return null;
    const f = filterProgram(program, search);
    const out = new Set();
    for (const id of f.talkIds) {
      const sid = String(id);
      if (graphTalkIds.has(sid)) out.add(sid);
    }
    return out;
  }, [program, search, graphTalkIds, posterGraphNodeIds, lightningGraphNodeIds, programTab]);

  const allDaysForQuery = useMemo(() => {
    if (programTab === "myprogram") return calendarDays;
    if (programTab === "posters" && posterDays.length) return posterDays;
    if (programTab === "lightning" && lightningDays.length) return lightningDays;
    return calendarDays;
  }, [programTab, posterDays, lightningDays, calendarDays]);

  useEffect(() => {
    if (!program) return;
    writeProgramQuery({
      selectedDays,
      allDays: allDaysForQuery,
      talk:
        programTab === "parallel" || programTab === "lightning" ? selectedTalkId : null,
      poster: programTab === "posters" ? selectedPosterId : null,
      tab: programTab,
    });
  }, [
    program,
    selectedDays,
    selectedTalkId,
    selectedPosterId,
    programTab,
    allDaysForQuery,
  ]);

  const programReady = useMemo(() => Boolean(program), [program]);

  if (!programReady) {
    return <div className="loading">Loading program...</div>;
  }

  return (
    <ProgramCartProvider>
      <ProgramView
        program={program}
        programTab={programTab}
        onProgramTabChange={(tab) => {
          setProgramTab(tab);
          if (tab === "posters") {
            setSelectedTalkId(null);
            setParallelDisplayMode("list");
            setLightningDisplayMode("list");
            setNetworkFocusTalkId(null);
          } else if (tab === "lightning") {
            setSelectedPosterId(null);
            setSelectedTalkId(null);
            setParallelDisplayMode("list");
            setPosterDisplayMode("list");
            setNetworkFocusTalkId(null);
          } else if (tab === "myprogram") {
            setSelectedTalkId(null);
            setSelectedPosterId(null);
            setNetworkFocusTalkId(null);
          } else {
            setSelectedPosterId(null);
            setPosterDisplayMode("list");
            setLightningDisplayMode("list");
          }
        }}
        parallelDisplayMode={parallelDisplayMode}
        onParallelDisplayModeChange={(mode) => {
          setParallelDisplayMode(mode);
          if (mode === "list") setNetworkFocusTalkId(null);
        }}
        posterDisplayMode={posterDisplayMode}
        onPosterDisplayModeChange={(mode) => {
          setPosterDisplayMode(mode);
        }}
        lightningDisplayMode={lightningDisplayMode}
        onLightningDisplayModeChange={(mode) => {
          setLightningDisplayMode(mode);
          if (mode === "list") setNetworkFocusTalkId(null);
        }}
        calendarDays={calendarDays}
        posterDays={posterDays}
        lightningDays={lightningDays}
        selectedDays={selectedDays}
        onToggleDay={(day) => {
          setDaysByTab((prev) => {
            const key = daysTabKey(programTab);
            const cur = prev[key] ?? [];
            const next = new Set(cur);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            const sorted = Array.from(next).sort(
              (a, b) =>
                parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b)
            );
            return { ...prev, [key]: sorted };
          });
          setSelectedTalkId(null);
          setSelectedPosterId(null);
        }}
        search={search}
        onSearchChange={setSearch}
        searchMatchIds={searchMatchIds}
        selectedTalkId={selectedTalkId}
        onSelectTalk={setSelectedTalkId}
        onClearTalk={() => setSelectedTalkId(null)}
        selectedPosterId={selectedPosterId}
        onSelectPoster={setSelectedPosterId}
        onClearPoster={() => setSelectedPosterId(null)}
        networkFocusTalkId={networkFocusTalkId}
        posterNetworkFocusId={selectedPosterId}
        lightningNetworkFocusId={programTab === "lightning" ? selectedTalkId : null}
        graphTalkIds={graphTalkIds}
        posterGraphNodeIds={posterGraphNodeIds}
        lightningGraphNodeIds={lightningGraphNodeIds}
      />
    </ProgramCartProvider>
  );
}

export default App;
