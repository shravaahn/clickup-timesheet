// src/app/dashboard/analytics/page.tsx

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

/** ---- chart stubs (SVG, no deps) ---- */
function BarsVertical({
  labels = ["Mon","Tue","Wed","Thu","Fri"], a = [0,0,0,0,0], b = [0,0,0,0,0], titleA = "Est", titleB = "Tracked",
}: { labels?: string[]; a?: number[]; b?: number[]; titleA?: string; titleB?: string }) {
  const H = 220, pad = 26, W = Math.max(340, labels.length * 92);
  const maxVal = Math.max(1, ...(a.length ? a : [0]), ...(b.length ? b : [0])) * 1.2;
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
        const va = a[i] ?? 0;
        const vb = b[i] ?? 0;
        return (
          <g key={i}>
            <rect x={xA} y={y(va)} width={bw} height={H-pad - y(va)} className={styles.barA}/>
            <rect x={xB} y={y(vb)} width={bw} height={H-pad - y(vb)} className={styles.barB}/>
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
  labels = [], a = [], b = [], titleA="Est", titleB="Tracked", maxBars=8,
}: { labels?: string[]; a?: number[]; b?: number[]; titleA?: string; titleB?: string; maxBars?: number }) {
  const rows = (labels.map((name, i) => ({ name, a: a[i] || 0, b: b[i] || 0 }))
    .sort((x,y)=> (y.b - y.a) - (x.b - x.a))
    .slice(0, maxBars));
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

export default function AnalyticsPage() {
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

  function onChangeWeek(idxStr: string) {
    const idx = Number(idxStr);
    setSelectedWeekIdx(idx);
    const w = monthWeeks[idx];
    if (w) setWeekStart(w.start);
  }

  /** auth + role */
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  /** consultants */
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  /** projects + timesheet */
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  /** weekly estimates state: map weekStart (YYYY-MM-DD) -> { hours: number; locked: boolean } */
  const [weeklyEstimates, setWeeklyEstimates] = useState<Record<string, { hours: number; locked: boolean }>>({});

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

  /* fetch weekly estimates for selected user */
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

  /* names for chart */
  const memberNameById = useMemo(() => {
    const m = new Map<string,string>();
    for (const mem of members) m.set(mem.id, mem.name || mem.username || mem.email || mem.id);
    return m;
  }, [members]);
  const overviewResolved = useMemo(() => {
    return overviewRows.map(r => {
      const looksLikeId = /^[0-9]+$/.test(r.name) || r.name.length > 20;
      const friendly = looksLikeId ? (memberNameById.get(r.name) || r.name) : r.name;
      return { ...r, name: friendly };
    });
  }, [overviewRows, memberNameById]);

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Analytics</div>
            <div className={styles.brandTagline}>
              Week {selectedWeekIdx + 1}: {monthWeeks[selectedWeekIdx]?.label ?? `${fmtMMMdd(weekStart)} — ${fmtMMMdd(weekEnd)}`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analytics content: KPI cards + charts
  const totalTracked = totals.sumTracked;
  const totalEst = totals.sumEst;
  const nonBillable = Math.max(0, totalTracked * 0.2); // placeholder
  const efficiency = totalEst > 0 ? Math.round((totalTracked / totalEst) * 1000) / 10 : 0;

  const labels = ["Mon","Tue","Wed","Thu","Fri"];
  const trackedArr = totals.dayTracked.map(clamp2);
  const estArr = [0,0,0,0,0]; // we don't have per-day ests; keep zeros

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <DashboardNavbar activeTab="analytics" onTabChange={(t) => window.location.href = `/dashboard/${t}`} me={me} />

      <div style={{ flex: 1, marginLeft: 0 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />

            <section className={styles.card}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                {isAdmin && (
                  <>
                    <label className={styles.selectorLabel}>Consultant:</label>
                    <select className={styles.selectWide} value={selectedUserId ?? ""} onChange={(e)=> setSelectedUserId(e.target.value)}>
                      {(members || []).map(m => <option key={m.id} value={m.id}>{m.name || m.username || m.email}</option>)}
                    </select>

                    <label className={styles.selectorLabel} style={{ marginLeft: 8 }}>Week:</label>
                    <select className={styles.selectWide} value={String(selectedWeekIdx)} onChange={(e)=> onChangeWeek(e.target.value)}>
                      {monthWeeks.map((w, i) => <option key={i} value={String(i)}>{`Week ${i+1}: ${w.label}`}</option>)}
                    </select>
                  </>
                )}

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className={styles.btn} onClick={()=> { setWeekStart(d=> addDays(d,-7)); }}>◀ Prev</button>
                  <button className={styles.btn} onClick={()=> setWeekStart(startOfWeek())}>This Week</button>
                  <button className={styles.btn} onClick={()=> { setWeekStart(d=> addDays(d,7)); }}>Next ▶</button>
                </div>
              </div>

              <div className={styles.cardsRow} style={{ marginBottom: 12 }}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Total Tracked Time</div>
                  <div className={styles.statValue}>{totalTracked.toFixed(2)}h</div>
                  <div className={styles.help}>Weekly total for selected consultant</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Billable Hours</div>
                  <div className={styles.statValue}>{(totalTracked*0.8).toFixed(2)}h</div>
                  <div className={styles.help}>Estimated billable portion (placeholder)</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Non-Billable Hours</div>
                  <div className={styles.statValue}>{nonBillable.toFixed(2)}h</div>
                  <div className={styles.help}>Placeholder</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Efficiency Rate</div>
                  <div className={styles.statValue}>{efficiency}%</div>
                  <div className={styles.help}>Tracked vs Estimated</div>
                </div>
              </div>

              <div className={styles.chartsGrid}>
                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}>Daily Totals (Week)</div>
                  <BarsVertical labels={labels} a={estArr} b={trackedArr} titleA="Est" titleB="Tracked"/>
                </div>

                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}>Consultants (Est vs Tracked) — Selected Week</div>
                  {overviewResolved.length === 0 ? (
                    <div className="text-sm text-[var(--muted)]">No data for this week.</div>
                  ) : (
                    <BarsHorizontal labels={overviewResolved.map(r=>r.name)} a={overviewResolved.map(r=>r.est)} b={overviewResolved.map(r=>r.tracked)} />
                  )}
                </div>

                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}>Project Distribution (sample)</div>
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                    <div>No detailed project chart available</div>
                  </div>
                </div>

                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}>Weekly Productivity</div>
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                    <div>Radar/line chart placeholder</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}