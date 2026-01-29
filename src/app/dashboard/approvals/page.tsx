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
type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean; is_owner?: boolean; is_manager?: boolean } };

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
  const [isAdmin, setIsAdmin] = useState(false);

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

        // Redirect if not authorized
        const canAccess = u.is_owner || u.is_manager;
        if (!canAccess) {
          router.push("/dashboard/timesheets");
          return;
        }
      } catch {
        router.push("/login");
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  // TEMP: mock data so UI is visible for demo
  const [rows, setRows] = useState([
    {
      id: "demo-1",
      consultant: "John Doe",
      week: "Jan 22 — Jan 26",
      hours: 38.5,
    },
    {
      id: "demo-2",
      consultant: "Jane Smith",
      week: "Jan 22 — Jan 26",
      hours: 41,
    },
  ]);

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

              {rows.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  No pending approvals right now
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rows.map(r => (
                  <div
                    key={r.id}
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
                        Week: {r.week} • {r.hours}h
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button className={`${styles.btn} ${styles.primary}`}>
                        Approve
                      </button>
                      <button className={`${styles.btn} ${styles.warn}`}>
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