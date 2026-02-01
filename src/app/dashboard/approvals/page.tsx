// src/app/dashboard/approvals/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

/** ---- types ---- */
type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean; roles?: string[] } };

type ApprovalRow = {
  user_id: string;
  consultant: string;
  week_start: string; // YYYY-MM-DD
  total_hours: number;
};

export default function ApprovalsPage() {
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

  /** auth + role */
  const [me, setMe] = useState<Me["user"] | null>(null);

  /** pending approvals */
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

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

        // Route guard: OWNER or MANAGER only
        const roles = u.roles || [];
        const isOwner = roles.includes("OWNER");
        const isManager = roles.includes("MANAGER");
        
        if (!isOwner && !isManager) {
          router.push("/dashboard/timesheets");
          return;
        }
      } catch {
        router.push("/login");
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  /* fetch pending approvals */
  useEffect(() => {
    if (!me) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/approvals/pending", { cache: "no-store" });
        const j = await r.json();

        if (!r.ok) throw new Error(j.error || "Failed to load approvals");

        if (mounted) {
          setRows(j.rows || []);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [me]);

  /* approve handler */
  async function approveTimesheet(userId: string, weekStart: string) {
    const ok = confirm("Approve this timesheet?");
    if (!ok) return;

    const r = await fetch("/api/approvals/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, weekStart }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error || "Approval failed");
      return;
    }

    setRows(prev =>
      prev.filter(r => !(r.user_id === userId && r.week_start === weekStart))
    );
  }

  /* reject handler */
  async function rejectTimesheet(userId: string, weekStart: string) {
    const reason = prompt("Enter rejection reason");
    if (!reason) return;

    const r = await fetch("/api/approvals/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, weekStart, reason }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error || "Rejection failed");
      return;
    }

    setRows(prev =>
      prev.filter(r => !(r.user_id === userId && r.week_start === weekStart))
    );
  }

  /* week label formatter */
  function weekLabel(weekStart: string) {
    const d = new Date(weekStart + "T00:00:00Z");
    const end = new Date(d);
    end.setDate(end.getDate() + 4);

    const fmt = (x: Date) =>
      x.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    return `${fmt(d)} — ${fmt(end)}`;
  }

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Approvals</div>
            <div className={styles.brandTagline}>Review and approve timesheets</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <DashboardNavbar activeTab="approvals" me={me} />

      <div style={{ flex: 1, marginLeft: 0 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />

            <section className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Pending Timesheet Approvals</h3>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>
                    Review and approve submitted weekly timesheets
                  </div>
                </div>
              </div>

              {loading && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  Loading approvals…
                </div>
              )}

              {!loading && rows.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  No pending approvals right now
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rows.map(r => (
                  <div
                    key={`${r.user_id}-${r.week_start}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 16,
                      background: "var(--panel)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.consultant}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        Week: {weekLabel(r.week_start)} • {r.total_hours.toFixed(2)}h
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className={`${styles.btn} ${styles.primary}`}
                        onClick={() => approveTimesheet(r.user_id, r.week_start)}
                      >
                        Approve
                      </button>
                      <button
                        className={`${styles.btn} ${styles.warn}`}
                        onClick={() => rejectTimesheet(r.user_id, r.week_start)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}