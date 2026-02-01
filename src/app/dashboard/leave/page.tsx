// FILE: src/app/dashboard/leave/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";
import styles from "../Dashboard.module.css";

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <DashboardNavbar activeTab="leave" me={me} />

      <div style={{ flex: 1 }}>
        <div className={styles.page}>
          <div className={styles.shell}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>Leave</h2>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                View balances, apply for leave, and track requests
              </div>
            </div>

            {/* Placeholder sections – we’ll replace these */}
            <section className={styles.card} style={{ marginBottom: 16 }}>
              <strong>Leave Balances</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Coming next
              </div>
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
    </div>
  );
}
