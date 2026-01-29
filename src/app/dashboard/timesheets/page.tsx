// src/app/dashboard/timesheets/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../Dashboard.module.css";
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";

/* ---------- Theme helpers ---------- */
type Scheme = "light" | "dark";
function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

/** ---- dates ---- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const toMidday = (d = new Date()) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const startOfWeek = (d = new Date()) => { const x = toMidday(d); const dow = (x.getDay()+6)%7; x.setDate(x.getDate()-dow); return toMidday(x); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return toMidday(x); };
const fmtMMMdd = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const clamp2 = (n: number) => Math.round(n*100)/100;

type WeekItem = { start: Date; end: Date; label: string };
function weeksInMonth(year: number, monthIdx: number): WeekItem[] {
  const firstOfMonth = toMidday(new Date(year, monthIdx, 1));
  const lastOfMonth  = toMidday(new Date(year, monthIdx + 1, 0));
  let curr = startOfWeek(firstOfMonth);
  const items: WeekItem[] = [];
  while (curr <= addDays(lastOfMonth, 6)) {
    const s = curr; const e = addDays(s, 4);
    const intersects =
      (s.getMonth() === monthIdx) || (e.getMonth() === monthIdx) ||
      (s <= lastOfMonth && e >= firstOfMonth);
    if (intersects) items.push({ start: s, end: e, label: `${fmtMMMdd(s)} — ${fmtMMMdd(e)}` });
    curr = addDays(curr, 7);
  }
  return items;
}

/** ---- types ---- */
type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean; is_owner?: boolean; is_manager?: boolean } };
type Member = { id: string; name?: string; username?: string; email?: string };
type Project = { id: string; name: string };
type Row = {
  taskId: string;
  taskName: string;
  estByDay: (number | null)[];
  estLockedByDay: boolean[];
  trackedByDay: (number | null)[];
  noteByDay: (string | null)[];
};

/** safe sum for (number|null)[] arrays */
const sumNullable = (arr: (number | null)[]) =>
  arr.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/** ---- data state ---- */
type TRACK_NOTE = string;
const TRACK_TYPES = [
  "billable | Meeting","billable | Builds","billable | Client Correspondence","PTO","Holiday",
  "Non Billable | Internal Team Meeting","Non Billable | Internal Projects","Non Billable | L&D",
  "Non Billable | PreSales/Sales","Non Billable | Client Research","Non Billable | Partner Engagement",
];

export default function TimesheetsPage() {
  /* theme sync (read only) */
  const [theme, setTheme] = useState<Scheme>("light");
  useEffect(() => {
    setTheme(getInitialTheme());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as Scheme | undefined;
      if (detail === "light" || detail === "dark") setTheme(detail);
    };
    const onStorage = () => setTheme(getInitialTheme());
    window.addEventListener("app-theme-change", onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("app-theme-change", onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /** week state */
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek());
  const weekEnd = useMemo(() => addDays(weekStart, 4), [weekStart]);
  const weekCols = useMemo(() => [0,1,2,3,4].map(i => addDays(weekStart, i)), [weekStart]);

  /** Month / Week selectors */
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  const monthYear = useMemo(() => {
    const [y,m] = selectedMonth.split("-").map(Number);
    return { y, mIdx: (m-1) };
  }, [selectedMonth]);
  const monthWeeks = useMemo(() => weeksInMonth(monthYear.y, monthYear.mIdx), [monthYear]);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  useEffect(() => {
    const idx = monthWeeks.findIndex(w => ymd(w.start) === ymd(weekStart));
    if (idx >= 0) setSelectedWeekIdx(idx);
  }, [monthWeeks, weekStart]);

  function onChangeMonth(v: string) {
    setSelectedMonth(v);
    const w0 = weeksInMonth(Number(v.split("-")[0]), Number(v.split("-")[1])-1)[0];
    if (w0) setWeekStart(w0.start);
  }
  function onChangeWeek(idxStr: string) {
    const idx = Number(idxStr);
    setSelectedWeekIdx(idx);
    const w = monthWeeks[idx];
    if (w) setWeekStart(w.start);
  }

  /** view */
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  /** auth + role */
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const displayName = me?.username || me?.email?.split("@")[0] || "user";

  /** consultants */
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  /** projects + timesheet */
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  /** weekly estimates state: map weekStart (YYYY-MM-DD) -> { hours: number; locked: boolean } */
  const [weeklyEstimates, setWeeklyEstimates] = useState<Record<string, { hours: number; locked: boolean }>>({});

  /** tracked modal */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTaskId, setModalTaskId] = useState("");
  const [modalTaskName, setModalTaskName] = useState("");
  const [modalDayIndex, setModalDayIndex] = useState(0);
  const [modalType, setModalType] = useState<TRACK_NOTE>("");
  const [modalHours, setModalHours] = useState<string>("");

  /** Add Weekly Estimate modal */
  const [estimateModalOpen, setEstimateModalOpen] = useState(false);
  const [estimateWeekStart, setEstimateWeekStart] = useState<string>(ymd(startOfWeek()));
  const [estimateHoursInput, setEstimateHoursInput] = useState<string>("");
  const [estimateBusy, setEstimateBusy] = useState(false);

  /* load me */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/me", { cache: "no-store" });
        if (resp.status === 401) { window.location.href = "/login"; return; }
        const meRes: Me = await resp.json();
        const u = meRes?.user;
        if (!mounted) return;
        if (!u?.id) { window.location.href = "/login"; return; }

        setMe(u);
        setIsAdmin(!!u.is_admin);
        setSelectedUserId(u.id);

        if (u.is_admin) {
          const cs = await fetch("/api/consultants", { cache: "no-store" }).then(r => r.json());
          const list: Member[] = (cs?.members || []).map((m: any) => ({
            id: String(m.id),
            name: m.name || m.username || (m.email ? m.email.split("@")[0] : ""),
            email: m.email,
          }));
          const sorted = list.filter(m => m.id).sort((a,b)=> (a.name||"").localeCompare(b.name||""));
          const withMeTop = [{ id: u.id, name: u.username || (u.email ? u.email.split("@")[0] : ""), email: u.email },
            ...sorted.filter(m => m.id !== u.id)];
          setMembers(withMeTop);
        } else {
          setMembers([{ id: u.id, name: u.username || (u.email ? u.email.split("@")[0] : ""), email: u.email }]);
        }
      } catch {
        window.location.href = "/login";
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* fetch weekly estimates for selected user (current week + next week) */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      try {
        const curr = ymd(startOfWeek());
        const next = ymd(addDays(startOfWeek(), 7));
        const r = await fetch(`/api/weekly-estimates?userId=${encodeURIComponent(selectedUserId)}&weeks=${encodeURIComponent(curr)},${encodeURIComponent(next)}`, { cache: "no-store" });
        const j = await r.json();
        const map: Record<string, { hours: number; locked: boolean }> = {};
        (j.rows || []).forEach((rec: any) => {
          map[String(rec.week_start)] = { hours: Number(rec.hours || 0), locked: !!rec.locked };
        });
        if (!mounted) return;
        setWeeklyEstimates(map);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [selectedUserId, weekStart]);

  /* reset state when user changes */
  useEffect(() => {
    setProjects([]);
    setRows([]);
  }, [selectedUserId]);

  /* projects for user */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/by-user?assigneeId=${encodeURIComponent(selectedUserId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.error) {
          if (!mounted) return;
          setProjects([]);
          return;
        }
        const list: Project[] = (j?.projects || []).map((p: any) => ({ id: String(p.id), name: String(p.name || p.id) }));
        if (!mounted) return;
        setProjects(list);
      } catch (e) {
        if (!mounted) return;
        setProjects([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedUserId]);

  /* merge timesheet for week */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      const start = ymd(weekStart), end = ymd(weekEnd);
      const ts = await fetch(`/api/timesheet?userId=${selectedUserId}&start=${start}&end=${end}`, { cache: "no-store" }).then(r => r.json());
      const entries = ts?.entries || [];

      const byKey = new Map<string, any>();
      const nameFromEntries = new Map<string, string>();
      for (const e of entries) {
        const pid = String(e.task_id);
        byKey.set(`${pid}|${e.date}`, e);
        if (e.task_name && !nameFromEntries.has(pid)) nameFromEntries.set(pid, e.task_name);
      }

      const projMap = new Map<string, { id: string; name: string }>();
      for (const p of projects) projMap.set(p.id, { id: p.id, name: p.name });
      for (const [pid, pname] of nameFromEntries.entries())
        if (!projMap.has(pid)) projMap.set(pid, { id: pid, name: pname || pid });
      const allProjects = Array.from(projMap.values()).sort((a,b)=> a.name.localeCompare(b.name));

      const newRows: Row[] = allProjects.map((p) => {
        const estByDay: (number|null)[] = [null,null,null,null,null];
        const estLockedByDay: boolean[] = [false,false,false,false,false];
        const trackedByDay: (number|null)[] = [null,null,null,null,null];
        const noteByDay: (string|null)[] = [null,null,null,null,null];

        weekCols.forEach((d, i) => {
          const it = byKey.get(`${p.id}|${ymd(d)}`);
          if (it) {
            estByDay[i] = it.estimate_hours ?? null;
            estLockedByDay[i] = !!it.estimate_locked;
            trackedByDay[i] = it.tracked_hours ?? null;
            noteByDay[i] = it.tracked_note ?? null;
          }
        });
        return { taskId: p.id, taskName: p.name, estByDay, estLockedByDay, trackedByDay, noteByDay };
      });

      if (mounted) setRows(newRows);
    })();
    return () => { mounted = false; };
  }, [projects, selectedUserId, weekStart, weekEnd, weekCols]);

  /* totals */
  const totals = useMemo(() => {
    const currWeek = ymd(weekStart);
    const weeklyEst = weeklyEstimates[currWeek]?.hours ?? 0;

    const dayEst = [0,0,0,0,0], dayTracked = [0,0,0,0,0];
    rows.forEach(r => {
      r.trackedByDay.forEach((v,i)=> dayTracked[i]+= (v||0));
    });
    const sumEst = clamp2(weeklyEst);
    const sumTracked = clamp2(dayTracked.reduce((a,b)=>a+b,0));
    const delta = clamp2(sumTracked - sumEst);
    return { dayEst, dayTracked, sumEst, sumTracked, delta };
  }, [rows, weeklyEstimates, weekStart]);

  /* actions */
  async function saveTracked(taskId: string, taskName: string, i: number, val: number, note: string) {
    if (!selectedUserId) return;
    if (!note || !note.trim()) { alert("Please choose a Type."); return; }
    const date = ymd(weekCols[i]);
    setRows(prev => prev.map(row => {
      if (row.taskId !== taskId) return row;
      const tr = [...row.trackedByDay]; const nt = [...row.noteByDay];
      tr[i] = Number(val); nt[i] = note; return { ...row, trackedByDay: tr, noteByDay: nt };
    }));
    const r = await fetch("/api/timesheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "tracked", userId: selectedUserId, taskId, taskName, date, hours: Number(val), note, syncToClickUp: true }),
    });
    if (!r.ok) {
      setRows(prev => prev.map(row => {
        if (row.taskId !== taskId) return row;
        const tr = [...row.trackedByDay]; const nt = [...row.noteByDay];
        tr[i] = null; nt[i] = ""; return { ...row, trackedByDay: tr, noteByDay: nt };
      }));
      const j = await r.json().catch(()=>({}));
      alert(`Failed to save tracked: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
    }
  }

  function exportCsv() {
    const header = ["Project","Mon Tracked","Mon Note","Tue Tracked","Tue Note","Wed Tracked","Wed Note","Thu Tracked","Thu Note","Fri Tracked","Fri Note","Total Tracked"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      let tt=0;
      const cells: (string|number)[] = [r.taskName || r.taskId];
      for (let i=0;i<5;i++){
        const t=r.trackedByDay[i]||0, n=(r.noteByDay[i]||"").replaceAll(",",";");
        tt+=t; cells.push(t, n);
      }
      cells.push(clamp2(tt));
      lines.push(cells.join(","));
    });
    const csv = lines.join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `timesheet_${ymd(weekStart)}_${selectedUserId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  /* tracked modal helpers */
  function openTrackModal(taskId: string, taskName: string, dayIndex: number, currentHours: number | null, currentNote: string | null) {
    setModalTaskId(taskId);
    setModalTaskName(taskName);
    setModalDayIndex(dayIndex);
    setModalType(currentNote || "");
    setModalHours(currentHours != null ? String(currentHours) : "");
    setModalOpen(true);
  }
  function closeTrackModal() { setModalOpen(false); setModalType(""); setModalHours(""); }
  function saveTrackModal() {
    const hoursNum = Number(modalHours);
    if (!modalType) { alert("Please select a Type"); return; }
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) { alert("Please enter hours > 0"); return; }
    saveTracked(modalTaskId, modalTaskName, modalDayIndex, hoursNum, modalType);
    closeTrackModal();
  }

  /* weekly estimate modal handlers */
  function openEstimateModalForWeek(ws: Date) {
    const key = ymd(ws);
    setEstimateWeekStart(key);
    setEstimateHoursInput(String(weeklyEstimates[key]?.hours ?? ""));
    setEstimateModalOpen(true);
  }

  async function submitWeeklyEstimate() {
    if (!selectedUserId) return alert("No user selected");
    const weekStartKey = estimateWeekStart;
    const hoursNum = Number(estimateHoursInput);
    if (!Number.isFinite(hoursNum) || hoursNum < 0) return alert("Enter a valid hours number");
    const curr = ymd(startOfWeek());
    const nxt = ymd(addDays(startOfWeek(), 7));
    if (![curr, nxt].includes(weekStartKey)) return alert("You may only submit for current or next week.");
    if (weeklyEstimates[weekStartKey]?.locked) return alert("Estimate already submitted and locked for that week.");

    setEstimateBusy(true);
    try {
      const r = await fetch("/api/weekly-estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, weekStart: weekStartKey, hours: hoursNum }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Failed to save estimate: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
        return;
      }
      setWeeklyEstimates(prev => ({ ...prev, [weekStartKey]: { hours: hoursNum, locked: true } }));
      setEstimateModalOpen(false);
    } finally {
      setEstimateBusy(false);
    }
  }

  /* admin unlock endpoint helper */
  async function adminUnlock(userId: string, weekStartKey: string) {
    if (!isAdmin) return alert("Only admins can unlock");
    const ok = confirm(`Unlock estimates for user ${userId} for week ${weekStartKey}?`);
    if (!ok) return;
    const r = await fetch("/api/weekly-estimates/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, weekStart: weekStartKey }),
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return alert(`Unlock failed: ${j.error || j.details || r.statusText}`);
    setWeeklyEstimates(prev => ({ ...prev, [weekStartKey]: { hours: prev[weekStartKey]?.hours ?? 0, locked: false } }));
    alert("Unlocked.");
  }

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Timesheet</div>
            <div className={styles.brandTagline}>
              {fmtMMMdd(weekStart)} — {fmtMMMdd(weekEnd)} • {isAdmin ? "Admin view" : "Consultant view"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <DashboardNavbar activeTab="timesheets" onTabChange={(t) => window.location.href = `/dashboard/${t}`} me={me} />

      <div style={{ flex: 1, marginLeft: 0 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />

            <div className="w-full rounded-lg border bg-[var(--panel)] border-[var(--border)] px-3 py-1.5 mb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-xs text-[var(--muted)] font-semibold px-2 py-1 border rounded-full border-[var(--border)]">
                    {isAdmin ? "ADMIN" : "CONSULTANT"}
                  </div>
                  <div className="text-sm font-semibold">{displayName}</div>

                  <div className="h-4 w-px bg-[var(--border)]" />

                  {isAdmin && (
                    <>
                      <label className={styles.selectorLabel}>Consultant:</label>
                      <select
                        className={styles.select}
                        value={selectedUserId ?? ""}
                        onChange={(e)=> setSelectedUserId(e.target.value)}
                      >
                        {(members || []).map(m => (
                          <option key={m.id} value={m.id}>{m.name || m.username || m.email}</option>
                        ))}
                      </select>
                      <div className="h-4 w-px bg-[var(--border)]" />
                    </>
                  )}

                  <button className={styles.btn} onClick={()=> setWeekStart(d=>addDays(d,-7))}>◀ Prev</button>
                  <button className={styles.btn} onClick={()=> setWeekStart(startOfWeek())}>This Week</button>
                  <button className={styles.btn} onClick={()=> setWeekStart(d=>addDays(d,7))}>Next ▶</button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button className={`${styles.btn} ${styles.primary}`} onClick={()=> alert("All changes auto-save on blur / Save.")}>Save</button>
                  <button className={styles.btn} onClick={exportCsv}>Export CSV</button>
                  <button className={`${styles.btn} ${styles.warn}`} onClick={()=> (window.location.href="/login")}>Log out</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 items-center mb-3">
              <div className="flex items-center gap-2">
                <label className={styles.selectorLabel}>Month:</label>
                <select
                  className={styles.selectWide}
                  value={selectedMonth}
                  onChange={(e)=> onChangeMonth(e.target.value)}
                >
                  {Array.from({length: 12}).map((_,i) => {
                    const y = monthYear.y;
                    const v = `${y}-${String(i+1).padStart(2,"0")}`;
                    return <option key={v} value={v}>{`${MONTHS[i]} ${y}`}</option>;
                  })}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className={styles.selectorLabel}>Week:</label>
                <select
                  className={styles.selectWide}
                  value={String(selectedWeekIdx)}
                  onChange={(e)=> onChangeWeek(e.target.value)}
                >
                  {monthWeeks.map((w, i) => (
                    <option key={i} value={String(i)}>{`Week ${i+1}: ${w.label}`}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 justify-start sm:justify-end">
                <label className={styles.selectorLabel}>View:</label>
                <div className={styles.viewToggle}>
                  <button
                    className={`${styles.btn} ${viewMode === "week" ? styles.selected : ""}`}
                    onClick={()=> setViewMode("week")}
                  >Week</button>
                  <button
                    className={`${styles.btn} ${viewMode === "month" ? styles.selected : ""}`}
                    onClick={()=> setViewMode("month")}
                  >Month</button>
                </div>
              </div>
            </div>

            <div className={styles.summary}>
              <span className={styles.pill}>Est (week): {totals.sumEst.toFixed(2)}h</span>
              <span className={styles.pill}>Tracked: {totals.sumTracked.toFixed(2)}h</span>
              <span className={styles.pill}>Δ (Tracked–Est): {(totals.delta).toFixed(2)}h</span>
              <span className={styles.period}>
                Period: {viewMode === "week" ? "Week" : "Month"}
                <button
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={()=> openEstimateModalForWeek(weekStart)}
                  title="Add / view estimate for this week"
                  style={{ marginLeft: 8 }}
                >
                  {weeklyEstimates[ymd(weekStart)] ? (weeklyEstimates[ymd(weekStart)].locked ? "View Estimate" : "Edit Estimate") : "Add Estimate"}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={()=> openEstimateModalForWeek(addDays(weekStart, 7))}
                  title="Add / view estimate for next week"
                  style={{ marginLeft: 8 }}
                >
                  {weeklyEstimates[ymd(addDays(weekStart,7))] ? (weeklyEstimates[ymd(addDays(weekStart,7))].locked ? "View (Next)" : "Edit (Next)") : "Add (Next)"}
                </button>
              </span>
            </div>

            {viewMode === "week" && (
              <section className={styles.card}>
                <div className={styles.tableWrap}>
                  <table className={styles.table} style={{ tableLayout: "auto" }}>
                    <colgroup>
                      <col />
                      {[0,1,2,3,4].map((i) => (
                        <col key={`d${i}`} width={160} />
                      ))}
                      <col width={160} />
                    </colgroup>

                    <thead>
                      <tr>
                        <th className={styles.thProject}>Project</th>
                        {["Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
                          <th key={d}>
                            <div className={styles.day}>{d} • {fmtMMMdd(weekCols[i])}</div>
                            <div className={styles.daySub}>Tracked</div>
                          </th>
                        ))}
                        <th>
                          <div className={styles.day}>Total (Week)</div>
                          <div className={styles.daySub}>Tracked</div>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading && (
                        <tr><td className={styles.thProject} colSpan={7}>Loading projects…</td></tr>
                      )}

                      {!loading && rows.map((r) => {
                        const tTracked = clamp2(sumNullable(r.trackedByDay));

                        return (
                          <tr key={r.taskId}>
                            <td className={styles.thProject}>
                              <div className={styles.projectNameFull} title={r.taskName}>
                                {r.taskName}
                              </div>
                            </td>

                            {[0,1,2,3,4].map((i) => (
                              <td key={i}>
                                <div className={styles.cellCompact}>
                                  <button
                                    onClick={() => openTrackModal(r.taskId, r.taskName, i, r.trackedByDay[i], r.noteByDay[i])}
                                    className={styles.btnTrackSm}
                                    title={r.noteByDay[i] || "Track time"}
                                  >
                                    {r.trackedByDay[i] != null ? `${r.trackedByDay[i]}h` : "Track"}
                                  </button>
                                </div>
                              </td>
                            ))}

                            <td>
                              <div className={styles.cellCompact}>
                                <input className={`${styles.num} ${styles.numSm}`} disabled value={tTracked.toFixed(2)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!loading && rows.length === 0 && (
                        <tr><td className={styles.thProject} colSpan={7}>No projects found for this consultant.</td></tr>
                      )}
                    </tbody>

                    <tfoot>
                      <tr>
                        <td className={styles.thProject}>All Projects Total</td>
                        {[0,1,2,3,4].map((i) => (
                          <td key={i}>
                            <div className={styles.cellCompact}>
                              <input className={`${styles.num} ${styles.numSm}`} disabled value={(totals.dayTracked[i]||0).toFixed(2)} />
                            </div>
                          </td>
                        ))}
                        <td>
                          <div className={styles.cellCompact}>
                            <input className={`${styles.num} ${styles.numSm}`} disabled value={totals.sumTracked.toFixed(2)} />
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

            {viewMode === "month" && (
              <>
                <div className={styles.summary} style={{ marginTop: 0 }} />

                <div className={styles.weekGrid}>
                  {monthWeeks.map((w, idx) => {
                    const isSelected = ymd(w.start) === ymd(weekStart);
                    const dayTracked = isSelected ? totals.dayTracked : [0,0,0,0,0];

                    return (
                      <section key={idx} className={`${styles.weekCard} ${isSelected ? styles.weekCardSelected : ""}`}>
                        <div className={styles.weekHead}>
                          <h3 className={styles.weekTitle}>Week {idx + 1}</h3>
                          <div className={styles.subtitle}>{fmtMMMdd(w.start)} — {fmtMMMdd(w.end)}</div>
                        </div>

                        <div className={styles.weekDays}>
                          {["Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
                            <div key={d} className={styles.dayCard}>
                              <div className={styles.dayLabel}>{d}</div>
                              <div className={styles.dayEst}>—</div>
                              <div className={styles.dayTracked}>{clamp2(dayTracked[i] || 0).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>

                        <div className={styles.weekTotals}>
                          <span>Tracked:</span>
                          <strong>{clamp2(dayTracked.reduce((a,b)=>a+(b||0),0)).toFixed(2)}h</strong>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}

            {isAdmin && viewMode === "week" && (
              <section className={styles.adminPanel}>
                <div className={styles.cardsRow}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Weekly Estimate (current)</div>
                    <div className={styles.statValue}>{(weeklyEstimates[ymd(weekStart)]?.hours ?? 0).toFixed(2)}h</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Tracked Hours (Week)</div>
                    <div className={styles.statValue}>{totals.sumTracked.toFixed(2)}h</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Δ Tracked – Est</div>
                    <div className={styles.statValue}>{totals.delta.toFixed(2)}h</div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className={styles.btn} onClick={async () => {
                    if (!selectedUserId) return;
                    const week = ymd(weekStart);
                    await adminUnlock(selectedUserId, week);
                  }}>
                    Unlock current week's estimate for selected consultant
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Track Time Modal */}
        {modalOpen && (
          <div className={styles.modalBackdrop} onClick={closeTrackModal}>
            <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Time Entry</div>
                <div className={styles.modalMeta}>
                  ({modalTaskName || "Untitled Project"}) • {fmtMMMdd(weekCols[modalDayIndex])}
                </div>
              </div>

              <div className={styles.modalBody}>
                <label className={styles.label}>Type</label>
                <select
                  className={`${styles.select} ${styles.selectWide}`}
                  value={modalType}
                  onChange={(e)=> setModalType(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {TRACK_TYPES.map((t)=> <option key={t} value={t}>{t}</option>)}
                </select>

                <label className={styles.label} style={{ marginTop: 12 }}>Hours</label>
                <input
                  className={styles.num}
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  placeholder="e.g., 1.5"
                  value={modalHours}
                  onChange={(e)=> setModalHours(e.currentTarget.value)}
                  onKeyDown={(e)=> { if (e.key === "Enter") saveTrackModal(); }}
                />
                <div className={styles.help}>Only Hours will show in the table. All fields are saved for reporting.</div>
              </div>

              <div className={styles.modalActions}>
                <button className={styles.btn} onClick={closeTrackModal}>Cancel</button>
                <button className={`${styles.btn} ${styles.primary}`} onClick={saveTrackModal}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Estimate Modal */}
        {estimateModalOpen && (
          <div className={styles.modalBackdrop} onClick={()=> setEstimateModalOpen(false)}>
            <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Weekly Estimate</div>
                <div className={styles.modalMeta}>
                  Enter total estimated hours for the week (once submitted, locked for consultants).
                </div>
              </div>

              <div className={styles.modalBody}>
                <label className={styles.label}>Week</label>
                <input className={styles.num} disabled value={estimateWeekStart} />

                <label className={styles.label} style={{ marginTop: 12 }}>Hours</label>
                <input
                  className={styles.num}
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  placeholder="e.g., 20"
                  value={estimateHoursInput}
                  onChange={(e)=> setEstimateHoursInput(e.currentTarget.value)}
                />
                <div className={styles.help}>You can only submit for the current week or next week. Admins can unlock.</div>
                {weeklyEstimates[estimateWeekStart] && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Existing:</strong> {weeklyEstimates[estimateWeekStart].hours}h — {weeklyEstimates[estimateWeekStart].locked ? "Locked" : "Unlocked"}
                  </div>
                )}
              </div>

              <div className={styles.modalActions}>
                <button className={styles.btn} onClick={()=> setEstimateModalOpen(false)}>Cancel</button>
                <button
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={submitWeeklyEstimate}
                  disabled={estimateBusy || !estimateHoursInput}
                >
                  {estimateBusy ? "Saving…" : (weeklyEstimates[estimateWeekStart]?.locked ? "View (Locked)" : "Save Estimate")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}