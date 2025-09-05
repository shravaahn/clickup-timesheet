// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./Dashboard.module.css";
import ThemeSwitch from "@/components/ThemeSwitch";

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
type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean } };
type Member = { id: string; username?: string; email?: string };
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

/** ---- chart stubs (SVG, no deps) ---- */
function BarsVertical({
  labels, a, b, titleA = "Est", titleB = "Tracked",
}: { labels: string[]; a: number[]; b: number[]; titleA?: string; titleB?: string }) {
  const H = 220, pad = 26, W = Math.max(340, labels.length * 92);
  const maxVal = Math.max(1, ...a, ...b) * 1.2;
  const y = (v: number) => H - pad - (v / maxVal) * (H - pad - 30);
  const band = (W - pad * 2) / labels.length;
  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} className={styles.chartAxis}/>
      <line x1={pad} y1={H-pad} x2={pad} y2={20} className={styles.chartAxis}/>
      {labels.map((_, i) => {
        const x0 = pad + i * band;
        const bw = Math.min(28, band/3);
        const xA = x0 + band/2 - bw - 3;
        const xB = x0 + band/2 + 3;
        return (
          <g key={i}>
            <rect x={xA} y={y(a[i])} width={bw} height={H-pad - y(a[i])} className={styles.barA}/>
            <rect x={xB} y={y(b[i])} width={bw} height={H-pad - y(b[i])} className={styles.barB}/>
            <text x={x0 + band/2} y={H-8} className={styles.chartX} textAnchor="middle">{labels[i]}</text>
          </g>
        );
      })}
      <g>
        <rect x={W - 160} y={10} width="10" height="10" className={styles.barA}/><text x={W-144} y={19} className={styles.leg}>{titleA}</text>
        <rect x={W - 90} y={10} width="10" height="10" className={styles.barB}/><text x={W-74} y={19} className={styles.leg}>{titleB}</text>
      </g>
    </svg>
  );
}

function BarsHorizontal({
  labels, a, b, titleA="Est", titleB="Tracked", maxBars=8,
}: { labels: string[]; a: number[]; b: number[]; titleA?: string; titleB?: string; maxBars?: number }) {
  const rows = labels.map((name, i) => ({ name, a: a[i] || 0, b: b[i] || 0 }))
    .sort((x,y)=> (y.b - y.a) - (x.b - x.a))
    .slice(0, maxBars);
  const ROW_H = 40;
  const H = Math.max(180, rows.length * ROW_H + 60);
  const W = 680, pad = 26;
  const maxVal = Math.max(1, ...rows.map(r=>Math.max(r.a,r.b))) * 1.15;
  const x = (v: number) => pad + (v / maxVal) * (W - pad - 14);

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {rows.map((r, i) => {
        const y = 30 + i * ROW_H;
        return (
          <g key={`${r.name}-${i}`}>
            <text x={pad} y={y-8} className={styles.chartY}>{r.name}</text>
            <line x1={pad} y1={y} x2={W-10} y2={y} className={styles.chartGrid}/>
            <rect x={pad} y={y+6}  width={Math.max(0, x(r.a)-pad)} height="10" rx="3" className={styles.barA}/>
            <rect x={pad} y={y+20} width={Math.max(0, x(r.b)-pad)} height="10" rx="3" className={styles.barB}/>
          </g>
        );
      })}
      <g>
        <rect x={W - 160} y={10} width="10" height="10" className={styles.barA}/><text x={W-144} y={19} className={styles.leg}>{titleA}</text>
        <rect x={W - 90}  y={10} width="10" height="10" className={styles.barB}/><text x={W-74}  y={19} className={styles.leg}>{titleB}</text>
      </g>
    </svg>
  );
}

/** ---- data state ---- */
type TRACK_NOTE = string;
const TRACK_TYPES = [
  "billable | Meeting","billable | Builds","billable | Client Correspondence","PTO","Holiday",
  "Non Billable | Internal Team Meeting","Non Billable | Internal Projects","Non Billable | L&D",
  "Non Billable | PreSales/Sales","Non Billable | Client Research","Non Billable | Partner Engagement",
];

export default function DashboardPage() {
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

  /** tracked modal */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTaskId, setModalTaskId] = useState("");
  const [modalTaskName, setModalTaskName] = useState("");
  const [modalDayIndex, setModalDayIndex] = useState(0);
  const [modalType, setModalType] = useState<TRACK_NOTE>("");
  const [modalHours, setModalHours] = useState<string>("");

  /** Add Project modal */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAssignee, setAddAssignee] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  /** admin summary */
  const [overviewRows, setOverviewRows] = useState<{ name: string; est: number; tracked: number }[]>([]);

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
            id: String(m.id), username: m.username || m.email, email: m.email,
          }));
          const sorted = list.filter(m => m.id).sort((a,b)=> (a.username||"").localeCompare(b.username||""));
          const withMeTop = [{ id: u.id, username: u.username || u.email, email: u.email },
            ...sorted.filter(m => m.id !== u.id)];
          setMembers(withMeTop);
        } else {
          setMembers([{ id: u.id, username: u.username || u.email, email: u.email }]);
        }
      } catch {
        window.location.href = "/login";
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (selectedUserId) setAddAssignee(selectedUserId);
  }, [selectedUserId]);

  /* projects for user */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/by-user?assigneeId=${selectedUserId}`, { cache: "no-store" });
        const j = await r.json();
        const list: Project[] = (j?.projects || []).map((p: any) => ({ id: String(p.id), name: String(p.name || p.id) }));
        if (!mounted) return;
        setProjects(list);
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
    const dayEst = [0,0,0,0,0], dayTracked = [0,0,0,0,0];
    rows.forEach(r => {
      r.estByDay.forEach((v,i)=> dayEst[i]+= (v||0));
      r.trackedByDay.forEach((v,i)=> dayTracked[i]+= (v||0));
    });
    const sumEst = clamp2(dayEst.reduce((a,b)=>a+b,0));
    const sumTracked = clamp2(dayTracked.reduce((a,b)=>a+b,0));
    const delta = clamp2(sumTracked - sumEst);
    return { dayEst, dayTracked, sumEst, sumTracked, delta };
  }, [rows]);

  /* names for chart */
  const memberNameById = useMemo(() => {
    const m = new Map<string,string>();
    for (const mem of members) m.set(mem.id, mem.username || mem.email || mem.id);
    return m;
  }, [members]);
  const overviewResolved = useMemo(() => {
    return overviewRows.map(r => {
      const looksLikeId = /^[0-9]+$/.test(r.name) || r.name.length > 20;
      const friendly = looksLikeId ? (memberNameById.get(r.name) || r.name) : r.name;
      return { ...r, name: friendly };
    });
  }, [overviewRows, memberNameById]);

  /* actions */
  const goPrev = () => setWeekStart(d => addDays(d, -7));
  const goNext = () => setWeekStart(d => addDays(d, 7));
  const goThis = () => setWeekStart(startOfWeek());

  async function saveEstimate(taskId: string, taskName: string, i: number, val: number) {
    if (!selectedUserId) return;
    const date = ymd(weekCols[i]);
    setRows(prev => prev.map(row => {
      if (row.taskId !== taskId) return row;
      const est = [...row.estByDay]; const lock = [...row.estLockedByDay];
      est[i] = Number(val); lock[i] = true; return { ...row, estByDay: est, estLockedByDay: lock };
    }));
    const r = await fetch("/api/timesheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "estimate", userId: selectedUserId, taskId, taskName, date, hours: Number(val), syncToClickUp: true }),
    });
    if (!r.ok) {
      setRows(prev => prev.map(row => {
        if (row.taskId !== taskId) return row;
        const est = [...row.estByDay]; const lock = [...row.estLockedByDay];
        est[i] = null; lock[i] = false; return { ...row, estByDay: est, estLockedByDay: lock };
      }));
      const j = await r.json().catch(()=>({}));
      alert(`Failed to save estimate: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
    }
  }

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
    const header = ["Project","Mon Est","Mon Tracked","Mon Note","Tue Est","Tue Tracked","Tue Note","Wed Est","Wed Tracked","Wed Note","Thu Est","Thu Tracked","Thu Note","Fri Est","Fri Tracked","Fri Note","Total Est","Total Tracked"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      let te=0, tt=0;
      const cells: (string|number)[] = [r.taskName || r.taskId];
      for (let i=0;i<5;i++){
        const e=r.estByDay[i]||0, t=r.trackedByDay[i]||0, n=(r.noteByDay[i]||"").replaceAll(",",";");
        te+=e; tt+=t; cells.push(e, t, n);
      }
      cells.push(clamp2(te), clamp2(tt));
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

  /* admin summary */
  useEffect(() => {
    if (!isAdmin) return;
    const start = ymd(weekStart), end = ymd(weekEnd);
    (async () => {
      const r = await fetch(`/api/admin/summary?start=${start}&end=${end}`, { cache: "no-store" });
      const j = await r.json().catch(()=>({ rows: [] }));
      setOverviewRows((j.rows || []).map((x: any)=>({ name: String(x.name), est: x.est || 0, tracked: x.tracked || 0 })));
    })();
  }, [isAdmin, weekStart, weekEnd]);

  /* Add Project handler */
  async function createProject() {
    if (!addName.trim() || !addAssignee) return;
    setAddBusy(true);
    try {
      const resp = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), assigneeId: addAssignee }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        alert(`Failed to create project: ${j.error || resp.statusText}${j.details ? ` — ${j.details}` : ""}`);
        return;
      }
      setAddOpen(false);
      setAddName("");
      setAddAssignee(selectedUserId);
      // Optionally reload projects
      // You may want to trigger a refresh here
    } finally {
      setAddBusy(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <div className={styles.page} data-theme={theme}>
      <div className={styles.shell}>
        {/* Branded header with logo + context */}
        <div className={styles.brandBar}>
          <div className={styles.brandLeft}>
            <img className={styles.brandLogo} src="/company-logo.png" alt="Company logo" />
            <div className={styles.brandText}>
              <div className={styles.brandTitle}>Timesheet</div>
              <div className={styles.brandTagline}>
                {fmtMMMdd(weekStart)} — {fmtMMMdd(weekEnd)} • {isAdmin ? "Admin view" : "Consultant view"}
              </div>
            </div>
          </div>
          <div className={styles.brandRight}>
            <ThemeSwitch />
          </div>
        </div>

        {/* ACTION BAR : left (identity/nav) | right (actions) */}
        <div className="w-full rounded-lg border bg-[var(--panel)] border-[var(--border)] px-3 py-2 mb-3">
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
                      <option key={m.id} value={m.id}>{m.username || m.email}</option>
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
              {isAdmin && (
                <button className={styles.btn} onClick={()=> setAddOpen(true)}>+ Add Project</button>
              )}
              <button className={`${styles.btn} ${styles.primary}`} onClick={()=> alert("All changes auto-save on blur / Save.")}>Save</button>
              <button className={styles.btn} onClick={exportCsv}>Export CSV</button>
              <button className={`${styles.btn} ${styles.warn}`} onClick={()=> (window.location.href="/login")}>Log out</button>
            </div>
          </div>
        </div>

        {/* SELECTORS (Month | Week | View) */}
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

        {/* summary pills */}
        <div className={styles.summary}>
          <span className={styles.pill}>Est: {totals.sumEst.toFixed(2)}h</span>
          <span className={styles.pill}>Tracked: {totals.sumTracked.toFixed(2)}h</span>
          <span className={styles.pill}>Δ (Tracked–Est): {(totals.delta).toFixed(2)}h</span>
          <span className={styles.period}>Period: {viewMode === "week" ? "Week" : "Month"}</span>
        </div>

        {/* ===== WEEK VIEW ===== */}
        {viewMode === "week" && (
          <section className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table} style={{ tableLayout: "auto" }}>
                <colgroup>
                  <col /* Project expands */ />
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
                        <div className={styles.daySub}>Est | Tracked</div>
                      </th>
                    ))}
                    <th>
                      <div className={styles.day}>Total (Week)</div>
                      <div className={styles.daySub}>Est | Tracked</div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading && (
                    <tr><td className={styles.thProject} colSpan={7}>Loading projects…</td></tr>
                  )}

                  {!loading && rows.map((r) => {
                    const tEst = clamp2(sumNullable(r.estByDay));
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
                              <input
                                className={`${styles.num} ${styles.numSm}`}
                                type="number" step="0.25" min="0"
                                value={r.estByDay[i] ?? ""}
                                onChange={(e)=> {
                                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                                  setRows(prev => prev.map(row => row.taskId===r.taskId ? {
                                    ...row, estByDay: prev.find(rr=>rr.taskId===r.taskId)!.estByDay.map((vv,ii)=> ii===i ? (v as any) : vv),
                                  }: row));
                                }}
                                onBlur={(e) => {
                                  const v = e.currentTarget.value;
                                  if (v === "" || r.estLockedByDay[i]) return;
                                  saveEstimate(r.taskId, r.taskName, i, Number(v));
                                }}
                                disabled={r.estLockedByDay[i]}
                                placeholder="Est"
                              />

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
                            <input className={`${styles.num} ${styles.numSm}`} disabled value={tEst.toFixed(2)} />
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
                          <input className={`${styles.num} ${styles.numSm}`} disabled value={(totals.dayEst[i]||0).toFixed(2)} />
                          <input className={`${styles.num} ${styles.numSm}`} disabled value={(totals.dayTracked[i]||0).toFixed(2)} />
                        </div>
                      </td>
                    ))}
                    <td>
                      <div className={styles.cellCompact}>
                        <input className={`${styles.num} ${styles.numSm}`} disabled value={totals.sumEst.toFixed(2)} />
                        <input className={`${styles.num} ${styles.numSm}`} disabled value={totals.sumTracked.toFixed(2)} />
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ===== MONTH VIEW ===== */}
        {viewMode === "month" && (
          <>
            <div className={styles.summary} style={{ marginTop: 0 }}>
              <span className={styles.period}>Period: Month</span>
            </div>

            <div className={styles.weekGrid}>
              {monthWeeks.map((w, idx) => {
                const isSelected = ymd(w.start) === ymd(weekStart);
                const dayEst = isSelected ? totals.dayEst : [0,0,0,0,0];
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
                          <div className={styles.dayEst}>{clamp2(dayEst[i] || 0).toFixed(2)}</div>
                          <div className={styles.dayTracked}>{clamp2(dayTracked[i] || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>

                    <div className={styles.weekTotals}>
                      <span>Est:</span>
                      <strong>{clamp2(dayEst.reduce((a,b)=>a+(b||0),0)).toFixed(2)}h</strong>
                      <span className={styles.dot}>•</span>
                      <span>Tracked:</span>
                      <strong>{clamp2(dayTracked.reduce((a,b)=>a+(b||0),0)).toFixed(2)}h</strong>
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}

        {/* ===== Admin cards + Charts ===== */}
        {isAdmin && viewMode === "week" && (
          <section className={styles.adminPanel}>
            <div className={styles.cardsRow}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Total Est Hours (Week)</div>
                <div className={styles.statValue}>{totals.sumEst.toFixed(2)}h</div>
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

            <div className={styles.chartsRow}>
              <div className={styles.chartCard} style={{ minHeight: 300 }}>
                <div className={styles.chartTitle}>Daily Totals (Est vs Tracked) — Week</div>
                <BarsVertical
                  labels={["Mon","Tue","Wed","Thu","Fri"]}
                  a={totals.dayEst.map(clamp2)}
                  b={totals.dayTracked.map(clamp2)}
                  titleA="Est"
                  titleB="Tracked"
                />
              </div>

              <div className={styles.chartCard} style={{ minHeight: 300 }}>
                <div className={styles.chartTitle}>
                  Consultants (Est vs Tracked) — Selected Week
                  <a className={styles.chartLink} href="/admin/overview">Open Overview</a>
                </div>
                {overviewResolved.length === 0 ? (
                  <div className="text-sm text-[var(--muted)]">No data for this week.</div>
                ) : (
                  <BarsHorizontal
                    labels={overviewResolved.map(r=>r.name)}
                    a={overviewResolved.map(r=>r.est)}
                    b={overviewResolved.map(r=>r.tracked)}
                    titleA="Est"
                    titleB="Tracked"
                    maxBars={8}
                  />
                )}
              </div>
            </div>

            <div className={styles.adminActions}>
              <button className={styles.btn} onClick={async () => {
                if (!selectedUserId) return;
                const start = ymd(weekStart), end = ymd(weekEnd);
                const r = await fetch("/api/admin/unlock-estimates", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: selectedUserId, start, end }),
                });
                if (r.ok) {
                  setRows(prev => prev.map(row => ({ ...row, estLockedByDay: row.estLockedByDay.map(() => false) })));
                  alert("Estimates unlocked for this week.");
                } else {
                  const j = await r.json().catch(()=>({}));
                  alert(`Unlock failed: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
                }
              }}>
                Unlock all estimates (visible period)
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Tracked modal */}
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

      {/* Add Project modal */}
      {isAdmin && addOpen && (
        <div className={styles.modalBackdrop} onClick={()=> setAddOpen(false)}>
          <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Add Project (Create Task)</div>
              <div className={styles.modalMeta}>Assign a task to a consultant</div>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.label}>Task name</label>
              <input
                className={styles.num}
                placeholder="e.g., Website Revamp"
                value={addName}
                onChange={(e)=> setAddName(e.currentTarget.value)}
              />

              <label className={styles.label} style={{ marginTop: 12 }}>Assign to</label>
              <select
                className={`${styles.select} ${styles.selectWide}`}
                value={addAssignee ?? ""}
                onChange={(e)=> setAddAssignee(e.target.value)}
              >
                {(members || []).map(c => (
                  <option key={c.id} value={c.id}>{c.username || c.email}</option>
                ))}
              </select>
              <div className={styles.help}>Creates a new ClickUp task in your configured List.</div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btn} onClick={()=> setAddOpen(false)}>Cancel</button>
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={createProject}
                disabled={!addName.trim() || !addAssignee || addBusy}
              >
                {addBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
