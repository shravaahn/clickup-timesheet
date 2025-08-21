"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./Dashboard.module.css";

/* ---------------- date helpers (SSR safe) ---------------- */
const MMM = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const toNoon = (d = new Date()) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return toNoon(x); };
const startOfWeek = (d = new Date()) => { const x = toNoon(d); const dow = (x.getDay()+6)%7; x.setDate(x.getDate()-dow); return toNoon(x); };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const mmmdd = (d: Date) => `${MMM[d.getMonth()]} ${d.getDate()}`;
const clamp2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- small math helpers (typed) ---------------- */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sum = (arr: Array<number | null | undefined>) =>
  clamp2(arr.reduce<number>((acc, v) => acc + (isNum(v) ? v : 0), 0));

/* ---------------- week list inside a month ---------------- */
type WeekSpan = { start: Date; end: Date; label: string };
function weeksInMonth(year: number, monthIndex: number): WeekSpan[] {
  const first = toNoon(new Date(year, monthIndex, 1));
  const last  = toNoon(new Date(year, monthIndex + 1, 0));
  let wStart = startOfWeek(first);
  const out: WeekSpan[] = [];
  // include the week that ends after the last day
  while (wStart <= addDays(last, 6)) {
    const s = wStart;
    const e = addDays(s, 4);
    // include if any overlap with the month
    const overlaps = s <= last && e >= first;
    if (overlaps) out.push({ start: s, end: e, label: `${mmmdd(s)} — ${mmmdd(e)}` });
    wStart = addDays(wStart, 7);
  }
  return out;
}

/* ---------------- types ---------------- */
type MeResp = { user?: { id: string; email: string; username?: string; is_admin?: boolean } };
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

/* ---------------- tracked time type options ---------------- */
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
];

/* ---------------- tiny SVG charts ---------------- */
function BarsVertical({
  labels, a, b, titleA="Est", titleB="Tracked",
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
  rows, titleA="Est", titleB="Tracked", maxBars=8,
}: { rows: { name: string; est: number; tracked: number }[]; titleA?: string; titleB?: string; maxBars?: number }) {
  const items = rows
    .map(r => ({ name: r.name, a: r.est || 0, b: r.tracked || 0 }))
    .sort((x,y)=> (y.b - y.a) - (x.b - x.a))
    .slice(0, maxBars);

  const H = Math.max(150, items.length * 34 + 48), W = 680, pad = 26;
  const maxVal = Math.max(1, ...items.map(r=>Math.max(r.a,r.b))) * 1.15;
  const x = (v: number) => pad + (v / maxVal) * (W - pad - 14);

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {items.map((r, i) => {
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

/* ===========================================================
   DASHBOARD
   =========================================================== */
export default function DashboardPage() {
  /* ---------- period state ---------- */
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek());
  const weekEnd   = useMemo(() => addDays(weekStart, 4), [weekStart]);
  const weekCols  = useMemo<Date[]>(() => [0,1,2,3,4].map(i => addDays(weekStart, i)), [weekStart]);
  const weekLabel = useMemo(() => `${mmmdd(weekStart)} — ${mmmdd(weekEnd)}`, [weekStart, weekEnd]);

  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
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

  const onChangeMonth = (v: string) => {
    setSelectedMonth(v);
    const weeks = weeksInMonth(Number(v.split("-")[0]), Number(v.split("-")[1]) - 1);
    if (weeks[0]) setWeekStart(weeks[0].start);
    setViewMode("month");
  };
  const onChangeWeek = (idxStr: string) => {
    const idx = Number(idxStr);
    setSelectedWeekIdx(idx);
    const w = monthWeeks[idx];
    if (w) setWeekStart(w.start);
  };

  /* ---------- auth + role ---------- */
  const [me, setMe] = useState<MeResp["user"] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const displayName = me?.username || me?.email?.split("@")[0] || "user";

  /* ---------- consultant list (admin only) ---------- */
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  /* ---------- projects + timesheet rows ---------- */
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- tracked modal ---------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTaskId, setModalTaskId] = useState("");
  const [modalTaskName, setModalTaskName] = useState("");
  const [modalDayIndex, setModalDayIndex] = useState(0);
  const [modalType, setModalType] = useState("");
  const [modalHours, setModalHours] = useState<string>("");

  /* ---------- admin add-project modal ---------- */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAssignTo, setAddAssignTo] = useState<string>("");

  /* ---------- admin overview rows for chart 2 ---------- */
  const [overviewRows, setOverviewRows] = useState<{ name: string; est: number; tracked: number }[]>([]);

  /* ---------- load /me + consultants ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) { window.location.href = "/login"; return; }
        const j: MeResp = await r.json();
        if (!alive) return;
        const u = j.user;
        if (!u?.id) { window.location.href = "/login"; return; }

        setMe(u); setIsAdmin(!!u.is_admin);
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
    return () => { alive = false; };
  }, []);

  /* ---------- load projects (derived from ClickUp tasks for selected user) ---------- */
  useEffect(() => {
    if (!selectedUserId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/by-user?assigneeId=${selectedUserId}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        const list: Project[] = (j?.projects || []).map((p: any) => ({
          id: String(p.id),
          name: String(p.name || p.id),
        }));
        setProjects(list);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedUserId]);

  /* ---------- merge with timesheet rows ---------- */
  useEffect(() => {
    if (!selectedUserId) return;
    let alive = true;

    (async () => {
      try {
        const start = ymd(weekStart), end = ymd(weekEnd);
        const ts = await fetch(`/api/timesheet?userId=${selectedUserId}&start=${start}&end=${end}`, { cache: "no-store" }).then(r => r.json());
        const entries = ts?.entries || [];

        const byKey = new Map<string, any>();
        const namesFromEntries = new Map<string, string>();
        for (const e of entries) {
          const pid = String(e.task_id);
          byKey.set(`${pid}|${e.date}`, e);
          if (e.task_name && !namesFromEntries.has(pid)) namesFromEntries.set(pid, e.task_name);
        }

        const projMap = new Map<string, { id: string; name: string }>();
        for (const p of projects) projMap.set(p.id, { id: p.id, name: p.name });
        for (const [pid, pname] of namesFromEntries.entries()) {
          if (!projMap.has(pid)) projMap.set(pid, { id: pid, name: pname || pid });
        }
        const all = Array.from(projMap.values()).sort((a,b)=> a.name.localeCompare(b.name));

        const newRows: Row[] = all.map((p) => {
          const estByDay: (number|null)[] = [null,null,null,null,null];
          const estLockedByDay: boolean[] = [false,false,false,false,false];
          const trackedByDay: (number|null)[] = [null,null,null,null,null];
          const noteByDay: (string|null)[] = [null,null,null,null,null];

          weekCols.forEach((d, i) => {
            const it = byKey.get(`${p.id}|${ymd(d)}`);
            if (it) {
              estByDay[i]      = isNum(it.estimate_hours) ? it.estimate_hours : null;
              estLockedByDay[i]= !!it.estimate_locked;
              trackedByDay[i]  = isNum(it.tracked_hours) ? it.tracked_hours : null;
              noteByDay[i]     = it.tracked_note ?? null;
            }
          });

          return { taskId: p.id, taskName: p.name, estByDay, estLockedByDay, trackedByDay, noteByDay };
        });

        if (alive) setRows(newRows);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => { alive = false; };
  }, [projects, selectedUserId, weekStart, weekEnd, weekCols]);

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    const dayEst = [0,0,0,0,0], dayTracked = [0,0,0,0,0];
    rows.forEach(r => {
      r.estByDay.forEach((v,i)=> dayEst[i]+= (isNum(v)? v : 0));
      r.trackedByDay.forEach((v,i)=> dayTracked[i]+= (isNum(v)? v : 0));
    });
    const sumEst = clamp2(dayEst.reduce((a,b)=>a+b,0));
    const sumTracked = clamp2(dayTracked.reduce((a,b)=>a+b,0));
    const delta = clamp2(sumTracked - sumEst);
    return { dayEst, dayTracked, sumEst, sumTracked, delta };
  }, [rows]);

  /* ---------- actions ---------- */
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
      body: JSON.stringify({ type: "estimate", userId: selectedUserId, taskId, taskName, date, hours: Number(val) }),
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
      body: JSON.stringify({ type: "tracked", userId: selectedUserId, taskId, taskName, date, hours: Number(val), note }),
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
        const e = isNum(r.estByDay[i]) ? r.estByDay[i]! : 0;
        const t = isNum(r.trackedByDay[i]) ? r.trackedByDay[i]! : 0;
        const n = (r.noteByDay[i] || "").replaceAll(",",";");
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

  const goPrev = () => setWeekStart(d => addDays(d, -7));
  const goNext = () => setWeekStart(d => addDays(d,  7));
  const goThis = () => setWeekStart(startOfWeek());

  /* ---------- modal helpers ---------- */
  function openTrackModal(taskId: string, taskName: string, dayIndex: number, currentHours: number | null, currentNote: string | null) {
    setModalTaskId(taskId);
    setModalTaskName(taskName);
    setModalDayIndex(dayIndex);
    setModalType(currentNote || "");
    setModalHours(currentHours != null ? String(currentHours) : "");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalType("");
    setModalHours("");
  }
  function saveModal() {
    const hoursNum = Number(modalHours);
    if (!modalType) { alert("Please select a Type"); return; }
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) { alert("Please enter hours > 0"); return; }
    saveTracked(modalTaskId, modalTaskName, modalDayIndex, hoursNum, modalType);
    closeModal();
  }

  /* ---------- admin unlock ---------- */
  async function unlockAllEstimates() {
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
  }

  /* ---------- admin month summary ---------- */
  useEffect(() => {
    if (!isAdmin) return;
    const start = ymd(weekStart), end = ymd(weekEnd);
    (async () => {
      const r = await fetch(`/api/admin/summary?start=${start}&end=${end}`, { cache: "no-store" });
      const j = await r.json().catch(()=>({ rows: [] }));
      setOverviewRows((j.rows || []).map((x: any)=>({ name: x.name, est: x.est || 0, tracked: x.tracked || 0 })));
    })();
  }, [isAdmin, weekStart, weekEnd]);

  /* ---------- admin add project ---------- */
  function openAddProject() {
    setAddAssignTo(selectedUserId || "");
    setAddName("");
    setAddOpen(true);
  }
  async function saveAddProject() {
    if (!addAssignTo || !addName.trim()) { alert("Choose assignee and enter a project (task) name."); return; }
    try {
      const r = await fetch("/api/admin/create-task", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), assigneeId: addAssignTo }),
      });
      if (!r.ok) {
        const j = await r.json().catch(()=>({}));
        alert(`Create task failed: ${j.error || r.statusText}. If this route is not implemented, point it to ClickUp POST /list/{id}/task.`);
      } else {
        alert("Project added. It may take a moment to appear.");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setAddOpen(false);
    }
  }

  /* ========================= render ========================= */
  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- header ---- */}
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.badge}>TT</div>
            <div>
              <div className={styles.title}>Time Tracking</div>
              <div className={styles.subtitle}>{viewMode === "week" ? weekLabel : `${MMM[monthYear.mIdx]} ${monthYear.y}`}</div>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.viewer}>
              <span className={styles.viewerName}>{displayName}</span>
              <span className={styles.roleDot}>— {isAdmin ? "ADMIN" : "CONSULTANT"}</span>
            </div>

            {isAdmin && (
              <select
                className={styles.select}
                value={selectedUserId ?? ""}
                onChange={(e)=> setSelectedUserId(e.target.value || me?.id || null)}
              >
                {members
                  .filter((v,i,arr)=> v.id && arr.findIndex(x=>x.id===v.id)===i)
                  .map(m => (<option key={m.id} value={m.id}>{m.username || m.email || m.id}</option>))}
              </select>
            )}

            <button className={styles.btn} onClick={goPrev}>◀ Prev</button>
            <button className={styles.btn} onClick={goThis}>This Week</button>
            <button className={styles.btn} onClick={goNext}>Next ▶</button>

            {isAdmin && <button className={styles.btn} onClick={openAddProject}>+ Add Project</button>}
            <button className={`${styles.btn} ${styles.primary}`} onClick={()=> alert("Values save on blur / via API.")}>Save</button>
            <button className={styles.btn} onClick={exportCsv}>Export CSV</button>
            <button className={`${styles.btn} ${styles.warn}`} onClick={()=> (window.location.href="/login")}>Log out</button>
          </div>
        </header>

        {/* ---- selectors ---- */}
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
                return <option key={v} value={v}>{`${MMM[i]} ${y}`}</option>;
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

        {/* ---- summary pills ---- */}
        <div className={styles.summary}>
          <span className={styles.pill}>{viewMode === "month" ? "Month Est" : "Est"}: {totals.sumEst.toFixed(2)}h</span>
          <span className={styles.pill}>{viewMode === "month" ? "Month Tracked" : "Tracked"}: {totals.sumTracked.toFixed(2)}h</span>
          <span className={styles.pill}>Δ: {(totals.delta).toFixed(2)}h</span>
          <span className={styles.period}>Period: {viewMode === "month" ? "Month" : "Week"}</span>
        </div>

        {/* ---- WEEK VIEW ---- */}
        {viewMode === "week" && (
          <section className={styles.card}>
            <div className={styles.scrollX}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thProject}>Project</th>
                    {["Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
                      <th key={d}>
                        <div className={styles.day}>{d} • {mmmdd(weekCols[i])}</div>
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
                    const tEst     = sum(r.estByDay);
                    const tTracked = sum(r.trackedByDay);
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
                                type="number" step="0.25" min="0"
                                value={isNum(r.estByDay[i]) ? r.estByDay[i]! : ""}
                                onChange={(e)=> {
                                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                                  setRows(prev => prev.map(row => row.taskId===r.taskId ? {
                                    ...row,
                                    estByDay: prev.find(rr=>rr.taskId===r.taskId)!.estByDay.map((vv,ii)=> ii===i ? (v as any) : vv),
                                  }: row));
                                }}
                                onBlur={(e) => {
                                  const raw = e.currentTarget.value;
                                  if (raw === "" || r.estLockedByDay[i]) return;
                                  const v = Number(raw);
                                  if (!Number.isFinite(v) || v < 0) { e.currentTarget.value = ""; return; }
                                  saveEstimate(r.taskId, r.taskName, i, v);
                                }}
                                disabled={r.estLockedByDay[i]}
                                placeholder="Est"
                              />

                              <button
                                className={`${styles.trackBtn} ${styles.numWide}`}
                                onClick={() => openTrackModal(r.taskId, r.taskName, i, isNum(r.trackedByDay[i]) ? r.trackedByDay[i]! : null, r.noteByDay[i])}
                              >
                                {isNum(r.trackedByDay[i]) ? `${r.trackedByDay[i]}h` : "Track"}
                              </button>
                            </div>
                          </td>
                        ))}

                        <td>
                          <div className={styles.cellBox}>
                            <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={tEst.toFixed(2)} />
                            <input className={`${styles.num} ${styles.numWide}`} disabled value={tTracked.toFixed(2)} />
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
                          <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={(totals.dayEst[i]||0).toFixed(2)} />
                          <input className={`${styles.num} ${styles.numWide}`} disabled value={(totals.dayTracked[i]||0).toFixed(2)} />
                        </div>
                      </td>
                    ))}
                    <td>
                      <div className={styles.cellBox}>
                        <input className={`${styles.num} ${styles.numWide} ${styles.locked}`} disabled value={totals.sumEst.toFixed(2)} />
                        <input className={`${styles.num} ${styles.numWide}`} disabled value={totals.sumTracked.toFixed(2)} />
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ---- MONTH VIEW ---- */}
        {viewMode === "month" && (
          <section className={styles.card}>
            <div className={styles.monthScroller}>
              {monthWeeks.map((w, wi) => {
                // per-week totals from current rows (Mon-Fri only)
                const labels = ["Mon","Tue","Wed","Thu","Fri"];
                const dayDates = [0,1,2,3,4].map(i => addDays(w.start, i));
                const dayEst = [0,0,0,0,0], dayTracked = [0,0,0,0,0];
                rows.forEach(r => {
                  dayDates.forEach((d, i) => {
                    // reuse current week's data only when week matches the selected week grid
                    if (ymd(d) >= ymd(weekStart) && ymd(d) <= ymd(weekEnd)) {
                      // when selected week equals this week card, use totals already computed above
                    }
                  });
                });

                // show the *current* table sums for selected week; for other weeks it's 0/0
                const isSelected = ymd(w.start) === ymd(weekStart);
                const sumsEst = isSelected ? totals.dayEst : [0,0,0,0,0];
                const sumsTrk = isSelected ? totals.dayTracked : [0,0,0,0,0];

                return (
                  <div className={styles.weekCard} key={wi}>
                    <div className={styles.weekHead}>
                      <div className={styles.weekTitle}>Week {wi+1}</div>
                      <div className={styles.weekRange}>{mmmdd(w.start)} — {mmmdd(w.end)}</div>
                    </div>

                    <div className={styles.weekRow}>
                      {labels.map((label, i) => (
                        <div className={styles.dayMini} key={i}>
                          <div className={styles.dayMiniHead}>{label}</div>
                          <div className={styles.dayMiniPills}>
                            <span className={styles.miniPill}>{(sumsEst[i]||0).toFixed(2)}</span>
                            <span className={styles.miniPill}>{(sumsTrk[i]||0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={styles.weekTotals}>
                      <div className={styles.weekTotalsBox}>
                        <span>Total Est</span>
                        <strong>{sum(sumsEst).toFixed(2)}</strong>
                      </div>
                      <div className={styles.weekTotalsBox}>
                        <span>Total Tracked</span>
                        <strong>{sum(sumsTrk).toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ---- Admin Tools + Charts ---- */}
        {isAdmin && (
          <section className={styles.adminPanel}>
            <div className={styles.cardsRow}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Total Est Hours ({viewMode === "month" ? "Month" : "Week"})</div>
                <div className={styles.statValue}>{totals.sumEst.toFixed(2)}h</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Total Tracked Hours ({viewMode === "month" ? "Month" : "Week"})</div>
                <div className={styles.statValue}>{totals.sumTracked.toFixed(2)}h</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Δ Tracked – Est</div>
                <div className={styles.statValue}>{totals.delta.toFixed(2)}h</div>
              </div>
            </div>

            <div className={styles.chartsRow}>
              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>
                  {viewMode === "month" ? "Weekly Totals (Est vs Tracked) — Month" : "Daily Totals (Est vs Tracked) — Week"}
                </div>
                {viewMode === "month" ? (
                  <BarsVertical
                    labels={["W1","W2","W3","W4","W5"]}
                    a={[0,0,0,0,0]}  // (optional) month aggregation can be wired later
                    b={[0,0,0,0,0]}
                    titleA="Est"
                    titleB="Tracked"
                  />
                ) : (
                  <BarsVertical
                    labels={["Mon","Tue","Wed","Thu","Fri"]}
                    a={totals.dayEst.map(v=>clamp2(v))}
                    b={totals.dayTracked.map(v=>clamp2(v))}
                    titleA="Est"
                    titleB="Tracked"
                  />
                )}
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>
                  Consultants (Est vs Tracked) — Selected {viewMode === "month" ? "Month" : "Week"}
                  <a className={styles.chartLink} href="/admin/overview">Open Overview</a>
                </div>
                <BarsHorizontal
                  rows={overviewRows}
                  titleA="Est"
                  titleB="Tracked"
                  maxBars={8}
                />
              </div>
            </div>

            <div className={styles.adminActions}>
              <button className={styles.btn} onClick={unlockAllEstimates}>
                Unlock all estimates (visible period)
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ---- Track modal ---- */}
      {modalOpen && (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Time Entry</div>
              <div className={styles.modalMeta}>
                ({modalTaskName || "Untitled Project"}) • {mmmdd(weekCols[modalDayIndex])}
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
                onKeyDown={(e)=> { if (e.key === "Enter") saveModal(); }}
              />
              <div className={styles.help}>Only Hours show in the table. All fields are saved for reporting.</div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btn} onClick={closeModal}>Cancel</button>
              <button className={`${styles.btn} ${styles.primary}`} onClick={saveModal}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Add Project (admin) ---- */}
      {addOpen && (
        <div className={styles.modalBackdrop} onClick={()=> setAddOpen(false)}>
          <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Add Project (creates ClickUp Task)</div>
              <div className={styles.modalMeta}>Assign to a consultant</div>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.label}>Project / Task Name</label>
              <input
                className={styles.text}
                placeholder="e.g., ACME Implementation – Phase 1"
                value={addName}
                onChange={(e)=> setAddName(e.currentTarget.value)}
              />

              <label className={styles.label} style={{ marginTop: 12 }}>Assignee</label>
              <select
                className={`${styles.select} ${styles.selectWide}`}
                value={addAssignTo}
                onChange={(e)=> setAddAssignTo(e.target.value)}
              >
                <option value="">— Select —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.username || m.email || m.id}</option>
                ))}
              </select>
              <div className={styles.help}>This calls <code>/api/admin/create-task</code>. Ensure that route is implemented to POST to ClickUp.</div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btn} onClick={()=> setAddOpen(false)}>Cancel</button>
              <button className={`${styles.btn} ${styles.primary}`} onClick={saveAddProject}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
