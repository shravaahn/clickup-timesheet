"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/Dashboard.module.css";

/** tiny date helpers */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const toMidday = (d = new Date()) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const startOfWeek = (d = new Date()) => { const x = toMidday(d); const dow = (x.getDay()+6)%7; x.setDate(x.getDate()-dow); return toMidday(x); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return toMidday(x); };
const fmtMMMdd = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const clamp2 = (n: number) => Math.round(n*100)/100;

type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean } };
type Member = { id: string; username?: string; email?: string };
type SumRow = { id: string; name: string; est: number; tracked: number };

export default function AdminOverviewPage() {
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek());
  const weekEnd = useMemo(() => addDays(weekStart, 4), [weekStart]);
  const weekLabel = useMemo(() => `${fmtMMMdd(weekStart)} — ${fmtMMMdd(weekEnd)}`, [weekStart, weekEnd]);

  const [members, setMembers] = useState<Member[]>([]);
  const [rows, setRows] = useState<SumRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j: Me = await r.json();
      const u = j?.user;
      if (!u) { window.location.href = "/login"; return; }
      if (!u.is_admin) { window.location.href = "/dashboard"; return; }

      setMe(u);
      setIsAdmin(true);

      const cs = await fetch("/api/consultants", { cache: "no-store" }).then(r => r.json());
      const list: Member[] = (cs?.members || []).map((m: any) => ({
        id: String(m.id), username: m.username || m.email, email: m.email,
      }));
      setMembers(list);
    })();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const start = ymd(weekStart), end = ymd(weekEnd);
    (async () => {
      const r = await fetch(`/api/admin/summary?start=${start}&end=${end}`, { cache: "no-store" });
      const j = await r.json().catch(()=>({ rows: [] as any[] }));
      const rowsServer: { id: string; name: string; est: number; tracked: number }[] = j.rows || [];

      const byId = new Map(members.map(m => [m.id, m]));
      const merged = rowsServer.map((x) => ({
        id: x.id,
        name: byId.get(x.id)?.username || byId.get(x.id)?.email || x.name || x.id,
        est: Number(x.est || 0),
        tracked: Number(x.tracked || 0),
      }));

      for (const m of members) {
        if (!merged.find(r => r.id === m.id)) {
          merged.push({ id: m.id, name: m.username || m.email || m.id, est: 0, tracked: 0 });
        }
      }

      merged.sort((a,b)=> b.tracked - a.tracked);
      setRows(merged);
    })();
  }, [isAdmin, members, weekStart, weekEnd]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(term));
  }, [rows, q]);

  const totals = useMemo(() => {
    const est = clamp2(filtered.reduce((s, r) => s + r.est, 0));
    const tracked = clamp2(filtered.reduce((s, r) => s + r.tracked, 0));
    return { est, tracked, delta: clamp2(tracked - est) };
  }, [filtered]);

  function exportCsv() {
    const header = ["Consultant","Est (h)","Tracked (h)","Δ (Tracked-Est)"];
    const lines = [header.join(",")];
    filtered.forEach(r => {
      lines.push([r.name, r.est.toFixed(2), r.tracked.toFixed(2), (r.tracked-r.est).toFixed(2)].join(","));
    });
    lines.push(["TOTAL", totals.est.toFixed(2), totals.tracked.toFixed(2), totals.delta.toFixed(2)].join(","));
    const csv = lines.join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `overview_${ymd(weekStart)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.badge}>TT</div>
            <div>
              <div className={styles.title}>Admin Overview</div>
              <div className={styles.subtitle}>{weekLabel}</div>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.viewer}>
              <span className={styles.viewerName}>{me?.username || me?.email}</span>
              <span className={styles.roleDot}>— ADMIN</span>
            </div>

            <button className={styles.btn} onClick={() => setWeekStart(d => addDays(d, -7))}>◀ Prev</button>
            <button className={styles.btn} onClick={() => setWeekStart(startOfWeek())}>This Week</button>
            <button className={styles.btn} onClick={() => setWeekStart(d => addDays(d, 7))}>Next ▶</button>
            <button className={styles.btn} onClick={() => (window.location.href = "/dashboard")}>Back to Dashboard</button>
            <button className={`${styles.btn} ${styles.primary}`} onClick={exportCsv}>Export CSV</button>
          </div>
        </header>

        <div className={styles.summary}>
          <span className={styles.pill}>Est: {totals.est.toFixed(2)}h</span>
          <span className={styles.pill}>Tracked: {totals.tracked.toFixed(2)}h</span>
          <span className={styles.pill}>Δ (Tracked–Est): {totals.delta.toFixed(2)}h</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <input
              className={styles.num}
              placeholder="Search consultant…"
              value={q}
              onChange={(e)=> setQ(e.currentTarget.value)}
              style={{ width: 240, height: 34 }}
            />
          </div>
        </div>

        <section className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th className={styles.thProject}>Consultant</th>
                  <th>Est (h)</th>
                  <th>Tracked (h)</th>
                  <th>Δ (Tracked–Est)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.thProject}>
                      <div className={styles.projectName} title={r.name}>{r.name}</div>
                    </td>
                    <td><input className={`${styles.num} ${styles.locked}`} disabled value={r.est.toFixed(2)} /></td>
                    <td><input className={styles.num} disabled value={r.tracked.toFixed(2)} /></td>
                    <td><input className={styles.num} disabled value={(r.tracked - r.est).toFixed(2)} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td className={styles.thProject} colSpan={4}>No consultants found.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className={styles.thProject}>TOTAL</td>
                  <td><input className={`${styles.num} ${styles.locked}`} disabled value={totals.est.toFixed(2)} /></td>
                  <td><input className={styles.num} disabled value={totals.tracked.toFixed(2)} /></td>
                  <td><input className={styles.num} disabled value={totals.delta.toFixed(2)} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
