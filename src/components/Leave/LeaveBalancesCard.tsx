// src/components/Leave/LeaveBalancesCard.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "@/app/dashboard/Dashboard.module.css";
import LeaveBalancesTable from "@/components/Leave/LeaveBalancesTable";

type BalanceRow = {
  leave_type_id: string;
  accrued_hours: number;
  used_hours: number;
  balance_hours: number;
  leave_type?: {
    name: string;
    code: string;
    paid: boolean;
  };
};

export default function LeaveBalancesCard() {
  const [year] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`/api/leave/balances?year=${year}`, {
          cache: "no-store",
        });

        const j = await r.json();
        if (!r.ok) {
          throw new Error(j.error || "Failed to load leave balances");
        }

        if (mounted) {
          setRows(j.balances || []);
        }
      } catch (err: any) {
        if (mounted) setError(err.message || "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [year]);

  return (
    <section className={styles.card} style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Leave Balances</h3>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Current year overview
        </div>
      </div>

      {loading && (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Loading balances…
        </div>
      )}

      {error && (
        <div style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <LeaveBalancesTable rows={rows} />
      )}
    </section>
  );
}
