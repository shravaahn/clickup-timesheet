// src/app/dashboard/leave/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";
import ApplyLeaveButton from "@/components/Leave/ApplyLeaveButton";
import ApplyLeaveModal from "@/components/Leave/ApplyLeaveModal";
import styles from "../Dashboard.module.css";

/* ---------- Theme helpers ---------- */
type Scheme = "light" | "dark";
function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

type LeaveBalance = {
  leave_type_id: string;
  total_hours: number;
  used_hours: number;
};

function getLeaveTypeName(leaveTypeId: string): string {
  const mapping: Record<string, string> = {
    PTO: "Paid Time Off",
    SICK: "Sick / Safe Leave",
    CASUAL: "Casual Leave",
    COMP_OFF: "Compensatory Off",
    UNPAID: "Unpaid Leave",
  };
  return mapping[leaveTypeId] || "Leave";
}

function formatBalance(hours: number): string {
  if (hours % 8 === 0) {
    return `${hours / 8} days`;
  }
  return `${hours}h`;
}

/**
 * Leave Dashboard
 * - Balances
 * - Calendar
 * - Requests
 *
 * UI will be layered step-by-step.
 */
export default function LeavePage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [showApplyLeave, setShowApplyLeave] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          router.push("/login");
          return;
        }
        const j = await r.json();
        if (!mounted) return;
        setMe(j.user);
      } catch {
        router.push("/login");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    let mounted = true;
    (async () => {
      setBalancesLoading(true);
      try {
        const r = await fetch("/api/leave/balances", { cache: "no-store" });
        const j = await r.json();
        if (!mounted) return;
        setBalances(j.balances || []);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setBalances([]);
      } finally {
        if (mounted) setBalancesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [me]);

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Leave</div>
            <div className={styles.brandTagline}>Manage leave, holidays, and requests</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <ApplyLeaveButton onClick={() => setShowApplyLeave(true)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <DashboardNavbar activeTab="leave" me={me} />

      <div style={{ flex: 1 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />

            <section className={styles.card} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 18, fontWeight: 800 }}>Leave Balances</strong>
              </div>

              {balancesLoading && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  Loading balances…
                </div>
              )}

              {!balancesLoading && balances.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  No leave balances found
                </div>
              )}

              {!balancesLoading && balances.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                  {balances.map((b) => {
                    const remaining = b.total_hours - b.used_hours;
                    return (
                      <div
                        key={b.leave_type_id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 16,
                          background: "var(--panel)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          {getLeaveTypeName(b.leave_type_id)}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                          {formatBalance(remaining)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {formatBalance(b.used_hours)} used of {formatBalance(b.total_hours)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.card} style={{ marginBottom: 16 }}>
              <strong>Leave Calendar</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Coming next
              </div>
            </section>

            <section className={styles.card}>
              <strong>Leave Requests</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Coming next
              </div>
            </section>
          </div>
        </div>
      </div>

      <ApplyLeaveModal
        open={showApplyLeave}
        onClose={() => setShowApplyLeave(false)}
      />
    </div>
  );
}