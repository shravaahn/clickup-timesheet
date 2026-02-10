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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {rows.map(r => {
            const remaining = r.balance_hours ?? 0;
            const used = r.used_hours ?? 0;
            const accrued = r.accrued_hours ?? 0;
            const name = r.leave_type?.name ?? r.leave_type_id;
            const paidLabel =
              r.leave_type?.paid === undefined
                ? "—"
                : r.leave_type.paid
                  ? "Paid"
                  : "Unpaid";
            const isEmpty = remaining === 0;

            return (
              <div
                key={r.leave_type_id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--panel)",
                  opacity: isEmpty ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {paidLabel}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                  {remaining}h
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {used} used of {accrued}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
