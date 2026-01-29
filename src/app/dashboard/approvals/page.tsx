// src/app/dashboard/approvals/page.tsx
"use client";

import { useEffect, useState } from "react";

type Approval = {
  approval_id: string;
  user_id: string;
  user_name: string;
  week_start: string;
  total_hours: number;
};

export default function TimesheetApprovalsPage() {
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => {
        const roles = d?.user?.roles || [];

        const isAllowed =
          roles.includes("OWNER") || roles.includes("MANAGER");

        if (!isAllowed) {
          window.location.href = "/dashboard";
        }
      });
  }, []);

  async function fetchPending() {
    setLoading(true);
    const res = await fetch("/api/approvals/timesheets/pending");
    const data = await res.json();
    setRows(data.rows || []);
    setLoading(false);
  }

  async function act(
    approvalId: string,
    action: "APPROVE" | "REJECT"
  ) {
    await fetch("/api/approvals/timesheets/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, action }),
    });

    fetchPending();
  }

  useEffect(() => {
    fetchPending();
  }, []);

  if (loading) return <div>Loading approvals…</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>Pending Timesheet Approvals</h2>

      {rows.length === 0 && (
        <div
          style={{
            padding: 24,
            border: "1px dashed #444",
            borderRadius: 12,
            background: "rgba(255,255,255,0.02)",
            maxWidth: 520,
          }}
        >
          <h3 style={{ marginBottom: 8 }}>No pending approvals</h3>
          <p style={{ opacity: 0.7 }}>
            Timesheets will appear here automatically every Friday after submission.
          </p>
          <p style={{ opacity: 0.7, marginTop: 8 }}>
            This section allows managers to approve or reject weekly timesheets.
          </p>
        </div>
      )}

      {rows.map(r => (
        <div
          key={r.approval_id}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            padding: 20,
            borderRadius: 12,
            marginBottom: 16,
            maxWidth: 600,
          }}
        >
          <div><b>{r.user_name}</b></div>
          <div>Week starting: {r.week_start}</div>
          <div>Total hours: {r.total_hours}</div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={() => act(r.approval_id, "APPROVE")}>
              Approve
            </button>
            <button onClick={() => act(r.approval_id, "REJECT")}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}