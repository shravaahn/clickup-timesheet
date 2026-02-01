// src/app/dashboard/profile/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../Dashboard.module.css";
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";
import LeavePortalModal from "@/components/Leave/LeavePortalModal";

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

export default function ProfilePage() {
  const router = useRouter();

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

  /** weekly estimates state */
  const [weeklyEstimates, setWeeklyEstimates] = useState<Record<string, { hours: number; locked: boolean }>>({});

  /** admin summary */
  const [overviewRows, setOverviewRows] = useState<{ name: string; est: number; tracked: number }[]>([]);

  /** Leave Portal modal state */
  const [showLeavePortal, setShowLeavePortal] = useState(false);

  /* load me */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/me", { cache: "no-store" });
        if (resp.status === 401) { router.push("/login"); return; }
        const meRes: Me = await resp.json();
        const u = meRes?.user;
        if (!mounted) return;
        if (!u?.id) { router.push("/login"); return; }

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
        router.push("/login");
      }
    })();
    return () => { mounted = false; };
  }, [router]);

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

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Profile</div>
            <div className={styles.brandTagline}>
              {me?.username ? `${me.username} • ${isAdmin ? "Admin" : "Consultant"}` : `${isAdmin ? "Admin" : "Consultant"}`}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            className={styles.btnPrimary}
            onClick={() => setShowLeavePortal(true)}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Leave Portal
          </button>
        </div>
      </div>
    );
  }

  // Profile content: derive some KPI values
  const est = totals.sumEst ?? 0;
  const tracked = totals.sumTracked ?? 0;
  const delta = totals.delta ?? 0;
  const efficiency = est > 0 ? Math.round((tracked / est) * 1000) / 10 : (tracked > 0 ? 100 : 0);
  const activeProjects = projects.length || 0;
  const overtime = Math.max(0, tracked - 40);
  const avgDaily = tracked > 0 ? Math.round((tracked / 5) * 10) / 10 : 0;
  const completionRate = 92;

  const recent = overviewRows.slice(0, 5).map(r => ({
    text: r.name && r.tracked ? `Tracked ${r.tracked}h — ${r.name}` : `Updated: ${r.name}`,
    when: r.tracked ? `${Math.round(r.tracked)}h` : "recent"
  }));
  if (recent.length === 0) {
    recent.push(
      { text: "Started tracking: Project Alpha", when: "2 hours ago" },
      { text: "Completed: Task Review", when: "4 hours ago" },
      { text: "Updated time estimate", when: "6 hours ago" }
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <DashboardNavbar activeTab="profile" me={me} />

      <div style={{ flex: 1, marginLeft: 0 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />

            <section className={styles.card}>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label className={styles.selectorLabel}>Consultant:</label>
                  <select className={styles.selectWide} value={selectedUserId ?? ""} onChange={(e)=> setSelectedUserId(e.target.value)}>
                    {(members || []).map(m => <option key={m.id} value={m.id}>{m.username || m.email}</option>)}
                  </select>

                  <label className={styles.selectorLabel}>Week:</label>
                  <select className={styles.selectWide} value={String(selectedWeekIdx)} onChange={(e)=> onChangeWeek(e.target.value)}>
                    {monthWeeks.map((w, i) => <option key={i} value={String(i)}>{`Week ${i+1}: ${w.label}`}</option>)}
                  </select>
                </div>
              )}

              <div className={styles.profileGrid}>
                <div className={`${styles.metricCard} accent-blue`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Estimated Time</div>
                  <div className={styles.metricValue}>{est.toFixed(1)}h</div>
                  <div className={styles.metricSubtitle}>This week</div>
                </div>

                <div className={`${styles.metricCard} accent-green`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Tracked Time</div>
                  <div className={styles.metricValue}>{tracked.toFixed(1)}h</div>
                  <div className={styles.metricSubtitle}>This week</div>
                </div>

                <div className={`${styles.metricCard} accent-red`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15V21H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 10L12 21L21 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Difference</div>
                  <div className={styles.metricValue} style={{ color: delta < 0 ? "var(--warn)" : "var(--primary-2)" }}>
                    {delta >= 0 ? `+${delta.toFixed(1)}h` : `${delta.toFixed(1)}h`}
                  </div>
                  <div className={styles.metricSubtitle}>{delta < 0 ? "Under estimation" : "Over estimation"}</div>
                </div>

                <div className={`${styles.metricCard} accent-purple`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="12" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.6"/>
                      <rect x="9" y="8" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.6"/>
                      <rect x="15" y="4" width="3" height="16" rx="1" stroke="currentColor" strokeWidth="1.6"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Efficiency Rate</div>
                  <div className={styles.metricValue}>{efficiency}%</div>
                  <div className={styles.metricSubtitle}>Tracked vs Estimated</div>
                </div>

                <div className={`${styles.metricCard} accent-yellow`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M3 7H9L11 9H21V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Active Projects</div>
                  <div className={styles.metricValue}>{activeProjects}</div>
                  <div className={styles.metricSubtitle}>Currently working on</div>
                </div>

                <div className={`${styles.metricCard} accent-blue`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Overtime</div>
                  <div className={styles.metricValue}>{overtime.toFixed(1)}h</div>
                  <div className={styles.metricSubtitle}>This week</div>
                </div>

                <div className={`${styles.metricCard} accent-green`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M16 2V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Avg. Daily Hours</div>
                  <div className={styles.metricValue}>{avgDaily.toFixed(1)}h</div>
                  <div className={styles.metricSubtitle}>This week</div>
                </div>

                <div className={`${styles.metricCard} accent-purple`}>
                  <div className={styles.metricIcon} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
                      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6"/>
                    </svg>
                  </div>
                  <div className={styles.metricTitle}>Completion Rate</div>
                  <div className={styles.metricValue}>{completionRate}%</div>
                  <div className={styles.metricSubtitle}>Tasks completed</div>
                </div>
              </div>

              <div className={styles.activityCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800 }}>Recent Activity</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{/* optional right text */}</div>
                </div>

                <ul className={styles.activityList}>
                  {recent.map((it, idx) => (
                    <li key={idx} className={styles.activityItem}>
                      <span className={styles.activityDot} aria-hidden style={{ background: `hsl(${(idx*70)%360} 70% 50%)` }} />
                      <span style={{ flex: 1 }}>{it.text}</span>
                      <span style={{ color: "var(--muted)", fontSize: 13, marginLeft: 12 }}>{it.when}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

      <LeavePortalModal 
        open={showLeavePortal} 
        onClose={() => setShowLeavePortal(false)} 
      />
    </div>
  );
}