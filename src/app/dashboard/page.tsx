"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Dashboard.module.css";

/** ---- SSR-safe date helpers ---- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
const toMidday = (d = new Date()) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const startOfWeek = (d = new Date()) => { const x = toMidday(d); const dow = (x.getDay()+6)%7; x.setDate(x.getDate()-dow); return toMidday(x); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return toMidday(x); };
const fmtMMMdd = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const clamp2 = (n: number) => Math.round(n*100)/100;

/** ---- Week helpers for Month selector ---- */
type WeekItem = { start: Date; end: Date; label: string };
function weeksInMonth(year: number, monthIdx: number): WeekItem[] {
  const firstOfMonth = toMidday(new Date(year, monthIdx, 1));
  const lastOfMonth  = toMidday(new Date(year, monthIdx + 1, 0));
  let curr = startOfWeek(firstOfMonth);
  const items: WeekItem[] = [];
  while (curr <= addDays(lastOfMonth, 6)) {
    const s = curr;
    const e = addDays(s, 4); // Mon–Fri
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

/** ---- Tracked type options ---- */
const TRACK_TYPES = [
  "billable | Meeting",
  "billable | Builds",
  "billable | Client Correspondence",
  "PTO",
  "Holiday",
  "Non Billable | Internal Team Meeting",
  "Non Billable | Internal Projects",
  "Non Billable | L&D",
  "Non Billable | PreSales/Sales",
  "Non Billable | Client Research",
  "Non Billable | Partner Engagement",
] as const;

/** ---- Small helpers ---- */
const safeNum = (v: unknown, min = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : 0;
};

export default function DashboardPage() {
  /** week state */
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek());
  const weekEnd = useMemo(() => addDays(weekStart, 4), [weekStart]);
  const weekCols = useMemo(() => [0,1,2,3,4].map(i => addDays(weekStart, i)), [weekStart]);
  const weekLabel = useMemo(() => `${fmtMMMdd(weekStart)} — ${fmtMMMdd(weekEnd)}`, [weekStart, weekEnd]);

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

  // keep dropdown Week in sync when weekStart changes (via prev/next buttons)
  useEffect(() => {
    const idx = monthWeeks.findIndex(w => ymd(w.start) === ymd(weekStart));
    if (idx >= 0) {
      setSelectedWeekIdx(idx);
      // If weekStart moved to a different month, keep Month dropdown in sync
      const d = weekStart;
      const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (v !== selectedMonth) setSelectedMonth(v);
    }
  }, [monthWeeks, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  function onChangeMonth(v: string) {
    setSelectedMonth(v);
    const [yy, mm] = v.split("-").map(Number);
    const w0 = weeksInMonth(yy, mm-1)[0];
    if (w0) setWeekStart(w0.start);
  }
  function onChangeWeek(idxStr: string) {
    const idx = Number(idxStr);
    setSelectedWeekIdx(idx);
    const w = monthWeeks[idx];
    if (w) setWeekStart(w.start);
  }

  /** view toggle */
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  /** auth + role */
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const displayName = me?.username || me?.email?.split("@")[0] || "user";

  /** consultants (admin only) */
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  /** projects + timesheet */
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** tracked modal */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTaskId, setModalTaskId] = useState("");
  const [modalTaskName, setModalTaskName] = useState("");
  const [modalDayIndex, setModalDayIndex] = useState(0);
  const [modalType, setModalType] = useState("");
  const [modalHours, setModalHours] = useState<string>("");
  const modalRef = useRef<HTMLDivElement>(null);

  /** Add Project modal (centered) */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAssignee, setAddAssignee] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  /** admin summary for chart 2 */
  const [overviewRows, setOverviewRows] = useState<{ name: string; est: number; tracked: number }[]>([]);

  /** load me + consultants */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/me", { cache: "no-store" });
        if (resp.status === 401) { window.location.href = "/login"; return; }
        if (!resp.ok) throw new Error(`Failed /api/me: ${resp.statusText}`);
        const meRes: Me = await resp.json();
        const u = meRes?.user;
        if (!mounted) return;
        if (!u?.id) { window.location.href = "/login"; return; }

        setMe(u);
        setIsAdmin(!!u.is_admin);
        setSelectedUserId(u.id);

        if (u.is_admin) {
          const csR = await fetch("/api/consultants", { cache: "no-store" });
          const cs = await csR.json().catch(()=> ({}));
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
      } catch (e: any) {
        if (mounted) setErrorText(e?.message || "Failed to load account.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  /** keep Add Project assignee in sync with selected user */
  useEffect(() => {
    if (selectedUserId) setAddAssignee(selectedUserId);
  }, [selectedUserId]);

  /** load projects (Lists) for selected user */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setErrorText(null);
      try {
        const r = await fetch(`/api/projects/by-user?assigneeId=${selectedUserId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text().catch(()=> r.statusText));
        const j = await r.json();
        const list: Project[] = (j?.projects || []).map((p: any) => ({ id: String(p.id), name: String(p.name || p.id) }));
        if (!mounted) return;
        setProjects(list);
      } catch (e: any) {
        if (mounted) setErrorText(e?.message || "Failed to load projects.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedUserId]);

  /** merge with timesheet (current week) */
  useEffect(() => {
    if (!selectedUserId) return;
    let mounted = true;
    (async () => {
      try {
        const start = ymd(weekStart), end = ymd(weekEnd);
        const r = await fetch(`/api/timesheet?userId=${selectedUserId}&start=${start}&end=${end}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text().catch(()=> r.statusText));
        const ts = await r.json();
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

        if (!mounted) return;
        setRows(newRows);
      } catch (e: any) {
        if (mounted) setErrorText(e?.message || "Failed to load timesheet.");
      }
    })();
    return () => { mounted = false; };
  }, [projects, selectedUserId, weekStart, weekEnd, weekCols]);

  /** totals (week) */
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

  /** actions */
  async function saveEstimate(taskId: string, taskName: string, i: number, val: number) {
    if (!selectedUserId) return;
    const hours = clamp2(safeNum(val));
    const date = ymd(weekCols[i]);
    // optimistic
    setRows(prev => prev.map(row => {
      if (row.taskId !== taskId) return row;
      const est = [...row.estByDay]; const lock = [...row.estLockedByDay];
      est[i] = hours; lock[i] = true; return { ...row, estByDay: est, estLockedByDay: lock };
    }));
    try {
      const r = await fetch("/api/timesheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "estimate", userId: selectedUserId, taskId, taskName, date, hours }),
      });
      if (!r.ok) {
        const j = await r.json().catch(()=> ({}));
        throw new Error(`Failed to save estimate: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
      }
    } catch (e: any) {
      // revert
      setRows(prev => prev.map(row => {
        if (row.taskId !== taskId) return row;
        const est = [...row.estByDay]; const lock = [...row.estLockedByDay];
        est[i] = null; lock[i] = false; return { ...row, estByDay: est, estLockedByDay: lock };
      }));
      alert(e?.message || "Failed to save estimate.");
    }
  }

  async function saveTracked(taskId: string, taskName: string, i: number, val: number, note: string) {
    if (!selectedUserId) return;
    const hours = clamp2(safeNum(val));
    if (!note || !note.trim()) { alert("Please choose a Type."); return; }
    if (!(hours > 0)) { alert("Please enter hours > 0"); return; }
    const date = ymd(weekCols[i]);
    // optimistic
    setRows(prev => prev.map(row => {
      if (row.taskId !== taskId) return row;
      const tr = [...row.trackedByDay]; const nt = [...row.noteByDay];
      tr[i] = hours; nt[i] = note; return { ...row, trackedByDay: tr, noteByDay: nt };
    }));
    try {
      const r = await fetch("/api/timesheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "tracked", userId: selectedUserId, taskId, taskName, date, hours, note }),
      });
      if (!r.ok) {
        const j = await r.json().catch(()=> ({}));
        throw new Error(`Failed to save tracked: ${j.error || r.statusText}${j.details ? ` — ${j.details}` : ""}`);
      }
    } catch (e: any) {
      // revert
      setRows(prev => prev.map(row => {
        if (row.taskId !== taskId) return row;
        const tr = [...row.trackedByDay]; const nt = [...row.noteByDay];
        tr[i] = null; nt[i] = ""; return { ...row, trackedByDay: tr, noteByDay: nt };
      }));
      alert(e?.message || "Failed to save tracked.");
    }
  }

  function exportCsv() {
    const header = ["Project",
      "Mon Est","Mon Tracked","Mon Note",
      "Tue Est","Tue Tracked","Tue Note",
      "Wed Est","Wed Tracked","Wed Note",
      "Thu Est","Thu Tracked","Thu Note",
      "Fri Est","Fri Tracked","Fri Note",
      "Total Est","Total Tracked"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      let te=0, tt=0;
      const cells: (string|number)[] = [r.taskName || r.taskId];
      for (let i=0;i<5;i++){
        const e=r.estByDay[i]||0, t=r.trackedByDay[i]||0, n=(r.noteByDay[i]||"").replaceAll(",",";").trim();
        te+=e; tt+=t; cells.push(clamp2(e), clamp2(t), n);
      }
      cells.push(clamp2(te), clamp2(tt));
      lines.push(cells.join(","));
    });
    const csv = lines.join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `timesheet_${ymd(weekStart)}_${selectedUserId||"user"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const goPrev = () => setWeekStart(d => addDays(d, -7));
  const goNext = () => setWeekStart(d => addDays(d, 7));
  const goThis = () => setWeekStart(startOfWeek());

  /** tracked modal helpers */
  function openTrackModal(taskId: string, taskName: string, dayIndex: number, currentHours: number | null, currentNote: string | null) {
    setModalTaskId(taskId);
    setModalTaskName(taskName);
    setModalDayIndex(dayIndex);
    setModalType(currentNote || "");
    setModalHours(currentHours != null ? String(currentHours) : "");
    setModalOpen(true);
  }
  function closeTrackModal() {
    setModalOpen(false);
    setModalType("");
    setModalHours("");
  }
  function saveTrackModal() {
    const hoursNum = Number(modalHours);
    if (!modalType) { alert("Please select a Type"); return; }
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) { alert("Please enter hours > 0"); return; }
    saveTracked(modalTaskId, modalTaskName, modalDayIndex, hoursNum, modalType);
    closeTrackModal();
  }

  // ESC closes any open modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalOpen) closeTrackModal();
        if (addOpen) setAddOpen(false);
      }
      // Quick nav
      if (e.altKey && e.key === "ArrowLeft") goPrev();
      if (e.altKey && e.key === "ArrowRight") goNext();
      if (e.altKey && (e.key.toLowerCase?.() === "t")) goThis();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, addOpen]);

  /** Add Project modal helpers */
  async function createProject() {
    if (!addName.trim() || !addAssignee) return;
    setAddBusy(true);
    try {
      const r = await fetch("/api/admin/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), assigneeId: addAssignee })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) {
        alert(`Create task failed: ${j?.error || r.statusText}`);
      } else {
        try {
          const rr = await fetch(`/api/projects/by-user?assigneeId=${addAssignee}`, { cache: "no-store" });
          const jj = await rr.json();
          setProjects((jj?.projects || []).map((p: any)=>({ id: String(p.id), name: String(p.name || p.id) })));
        } catch {}
        setAddOpen(false);
        setAddName("");
      }
    } finally {
      setAddBusy(false);
    }
  }

  /** load admin summary rows for chart 2 */
  useEffect(() => {
    if (!isAdmin) return;
    const start = ymd(weekStart), end = ymd(weekEnd);
    (async () => {
      const r = await fetch(`/api/admin/summary?start=${start}&end=${end}`, { cache: "no-store" });
      const j = await r.json().catch(()=>({ rows: [] }));
      setOverviewRows((j.rows || []).map((x: any)=>({ name: x.name, est: x.est || 0, tracked: x.tracked || 0 })));
    })();
  }, [isAdmin, weekStart, weekEnd]);

  /** ---- Tiny SVG charts (no deps) ---- */
  function BarsVertical({
    labels, a, b, titleA = "Est", titleB = "Tracked",
  }: { labels: string[]; a: number[]; b: number[]; titleA?: string; titleB?: string }) {
    const H = 220, pad = 26, W = Math.max(340, labels.length * 92);
    const maxVal = Math.max(1, ...a, ...b) * 1.2;
    const y = (v: number) => H - pad - (v / maxVal) * (H - pad - 30);
    const band = (W - pad * 2) / labels.length;
    return (
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Daily totals bar chart">
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
    const rowsLocal = labels.map((name, i) => ({ name, a: a[i] || 0, b: b[i] || 0 }))
                       .sort((x,y)=> (y.b - y.a) - (x.b - x.a))
                       .slice(0, maxBars);
    const H = Math.max(150, rowsLocal.length * 34 + 48), W = 680, pad = 26;
    const maxVal = Math.max(1, ...rowsLocal.map(r=>Math.max(r.a,r.b))) * 1.15;
    const x = (v: number) => pad + (v / maxVal) * (W - pad - 14);
    return (
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Consultants comparison bar chart">
        {rowsLocal.map((r, i) => {
          const y = 28 + i * 34;
          return (
            <g key={i}>
              <text x={pad} y={y-6} className={styles.chartY}>{r.name}</text>
              <line x1={pad} y1={y} x2={W-10} y2={y} className={styles.chartGrid}/>
              <rect x={pad} y={y+6} width={x(r.a)-pad} height="10" className={styles.barA}/>
              <rect x={pad} y={y+18} width={x(r.b)-pad} height="10" className={styles.barB}/>
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

  /** ---- render ---- */
  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* top header bar */}
        <header className={styles.header}>
          <div className={styles.brand}>
            {/* Logo (fallback to TT) */}
            <div className={styles.logoWrap}>
              <img
                className={styles.logoImg}
                src="/company-logo.png"
                alt="Company"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const sib = document.createElement("div");
                  sib.className = styles.badge;
                  sib.textContent = "TT";
                  (e.currentTarget.parentElement as HTMLElement).appendChild(sib);
                }}
              />
            </div>
            <div>
              <div className={styles.title}>Time Tracking</div>
              <div className={styles.subtitle}>{weekLabel}</div>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.viewer}>
              <span className={styles.viewerName}>{displayName}</span>
              <span className={styles.roleDot}>— {isAdmin ? "ADMIN" : "CONSULTANT"}</span>
            </div>

            {isAdmin && (
              <select
                aria-label="Select consultant"
                className={styles.select}
                value={selectedUserId ?? ""}
                onChange={(e)=> setSelectedUserId(e.target.value || me?.id || null)}
              >
                {members
                  .filter((v,i,arr)=> v.id && arr.findIndex(x=>x.id===v.id)===i)
                  .map(m => (<option key={m.id} value={m.id}>{m.username || m.email || m.id}</option>))}
              </select>
            )}

            <button className={styles.btn} onClick={goPrev} title="Alt+←">◀ Prev</button>
            <button className={styles.btn} onClick={goThis} title="Alt+T">This Week</button>
            <button className={styles.btn} onClick={goNext} title="Alt+→">Next ▶</button>

            {isAdmin && (
              <button
                className={styles.btn}
                onClick={()=> setAddOpen(true)}
                title="Create a new task (project) in the configured ClickUp list"
              >
                + Add Project
              </button>
            )}

            <button className={`${styles.btn} ${styles.primary}`} onClick={()=> alert("All changes auto-save on blur / Save.")}>Save</button>
            <button className={styles.btn} onClick={exportCsv}>Export CSV</button>
            <button className={`${styles.btn} ${styles.warn}`} onClick={()=> (window.location.href="/login")}>Log out</button>
          </div>
        </header>

        {/* error bar */}
        {errorText && (
          <div role="alert" className={styles.errorBar}>
            {errorText}
          </div>
        )}

        {/* selectors row */}
        <div className={styles.selectorsBar}>
          <div className={styles.selectorCol}>
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

          <div className={styles.selectorCol}>
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

          <div className={styles.selectorCol}>
            <label className={styles.selectorLabel}>View:</label>
            <div className={styles.viewToggle} role="tablist" aria-label="View mode">
              <button
                className={`${styles.btn} ${viewMode === "week" ? styles.selected : ""}`}
                onClick={()=> setViewMode("week")}
                role="tab"
                aria-selected={viewMode === "week"}
              >Week</button>
              <button
                className={`${styles.btn} ${viewMode === "month" ? styles.selected : ""}`}
                onClick={()=> setViewMode("month")}
                role="tab"
                aria-selected={viewMode === "month"}
              >Month</button>
            </div>
          </div>
        </div>

        {/* summary bar */}
        <div className={styles.summary}>
          <span className={styles.pill}>Est: {totals.sumEst.toFixed(2)}h</span>
          <span className={styles.pill}>Tracked: {totals.sumTracked.toFixed(2)}h</span>
          <span className={styles.pill}>Δ (Tracked–Est): {(totals.delta).toFixed(2)}h</span>
          <span className={styles.period}>Period: {viewMode === "week" ? "Week" : "Month"}</span>
        </div>

        {/* ====== WEEK VIEW ====== */}
        {viewMode === "week" && (
          <section className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
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
                    const tEst = clamp2(r.estByDay.reduce<number>((a, b) => a + (b ?? 0), 0));
                    const tTracked = clamp2(r.trackedByDay.reduce<number>((a, b) => a + (b ?? 0), 0));

                    return (
                      <tr key={r.taskId}>
                        <td className={styles.thProject}>
                          <div className={styles.projectName} title={r.taskName}>{r.taskName}</div>
                        </td>

                        {[0,1,2,3,4].map((i) => (
                          <td key={i}>
                            <div className={styles.cellBox}>
                              <input
                                className={`${styles.num} ${styles.numWide} ${r.estLockedByDay[i] ? styles.locked : ""}`}
                                type="number" step="0.25" min="0" inputMode="decimal"
                                value={r.estByDay[i] ?? ""}
                                onChange={(e)=> {
                                  const raw = e.currentTarget.value;
                                  const v = raw === "" ? null : clamp2(safeNum(raw));
                                  setRows(prev => prev.map(row => row.taskId===r.taskId ? {
                                    ...row, estByDay: prev.find(rr=>rr.taskId===r.taskId)!.estByDay.map((vv,ii)=> ii===i ? (v as any) : vv),
                                  }: row));
                                }}
                                onBlur={(e) => {
                                  const vStr = e.currentTarget.value;
                                  if (vStr === "" || r.estLockedByDay[i]) return;
                                  const v = clamp2(safeNum(vStr));
                                  if (v === 0) return; // don't save 0
                                  saveEstimate(r.taskId, r.taskName, i, v);
                                }}
                                disabled={r.estLockedByDay[i]}
                                placeholder="Est"
                                aria-label={`Estimate hours for ${r.taskName} on ${fmtMMMdd(weekCols[i])}`}
                              />

                              <button
                                className={`${styles.trackBtn} ${styles.numWide}`}
                                onClick={() => openTrackModal(r.taskId, r.taskName, i, r.trackedByDay[i], r.noteByDay[i])}
                                aria-label={`Add tracked time for ${r.taskName} on ${fmtMMMdd(weekCols[i])}`}
                              >
                                {r.trackedByDay[i] != null ? `${r.trackedByDay[i]}h` : "Track"}
                              </button>
                            </div>
                          </td>
                        ))}

                        <td>
                          <div className={styles.cellBox}>
                            <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={tEst.toFixed(2)} aria-label={`Total estimate for ${r.taskName}`} />
                            <input className={`${styles.num} ${styles.numWide}`} disabled value={tTracked.toFixed(2)} aria-label={`Total tracked for ${r.taskName}`} />
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
                        <div className={styles.cellBox}>
                          <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={(totals.dayEst[i]||0).toFixed(2)} aria-label={`Total estimate on ${fmtMMMdd(weekCols[i])}`} />
                          <input className={`${styles.num} ${styles.numWide}`} disabled value={(totals.dayTracked[i]||0).toFixed(2)} aria-label={`Total tracked on ${fmtMMMdd(weekCols[i])}`} />
                        </div>
                      </td>
                    ))}
                    <td>
                      <div className={styles.cellBox}>
                        <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={totals.sumEst.toFixed(2)} aria-label="Total estimate for all projects" />
                        <input className={`${styles.num} ${styles.numWide}`} disabled value={totals.sumTracked.toFixed(2)} aria-label="Total tracked for all projects" />
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ====== MONTH VIEW (responsive, no overlap; shows live data for selected week) ====== */}
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
                  <section
                    key={idx}
                    className={`${styles.weekCard} ${isSelected ? styles.weekCardSelected : ""}`}
                    aria-current={isSelected ? "true" : "false"}
                  >
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

            <div className={styles.monthKpis}>
              <div className={styles.metric}>Total Est Hours (Selected Week): {totals.sumEst.toFixed(2)}h</div>
              <div className={styles.metric}>Total Tracked Hours (Selected Week): {totals.sumTracked.toFixed(2)}h</div>
              <div className={styles.metric}>Δ Tracked – Est (Selected Week): {totals.delta.toFixed(2)}h</div>
            </div>
          </>
        )}

        {/* ===== Admin Tools + Charts (week-based) ===== */}
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
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>Daily Totals (Est vs Tracked) — Week</div>
                <BarsVertical
                  labels={["Mon","Tue","Wed","Thu","Fri"]}
                  a={totals.dayEst.map(clamp2)}
                  b={totals.dayTracked.map(clamp2)}
                  titleA="Est"
                  titleB="Tracked"
                />
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>
                  Consultants (Est vs Tracked) — Selected Week
                  <a className={styles.chartLink} href="/admin/overview">Open Overview</a>
                </div>
                <BarsHorizontal
                  labels={overviewRows.map(r=>r.name)}
                  a={overviewRows.map(r=>r.est)}
                  b={overviewRows.map(r=>r.tracked)}
                  titleA="Est"
                  titleB="Tracked"
                  maxBars={8}
                />
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

      {/* --- Modal for Tracked Time --- */}
      {modalOpen && (
        <div className={styles.modalBackdrop} onClick={closeTrackModal} aria-hidden="true">
          <div
            className={styles.modal}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trackTitle"
            onClick={(e)=> e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle} id="trackTitle">Time Entry</div>
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

      {/* --- Admin: Add Project modal (centered & smooth) --- */}
      {isAdmin && addOpen && (
        <div className={styles.modalBackdrop} onClick={()=> setAddOpen(false)} aria-hidden="true">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="addTitle"
            onClick={(e)=> e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle} id="addTitle">Add Project (Create Task)</div>
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
