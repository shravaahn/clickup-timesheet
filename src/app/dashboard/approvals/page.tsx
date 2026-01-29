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

      {rows.length === 0 && <p>No pending approvals</p>}

      {rows.map(r => (
        <div
          key={r.approval_id}
          style={{
            border: "1px solid #333",
            padding: 16,
            marginBottom: 12,
            borderRadius: 8,
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