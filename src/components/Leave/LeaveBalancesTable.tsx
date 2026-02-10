// src/components/Leave/LeaveBalancesTable.tsx
"use client";

type Row = {
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

export default function LeaveBalancesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        No leave balances configured for this year
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", fontSize: 13 }}>
          <th>Leave Type</th>
          <th>Total</th>
          <th>Used</th>
          <th>Available</th>
          <th>Paid</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const accrued = r.accrued_hours ?? 0;
          const used = r.used_hours ?? 0;
          const available = r.balance_hours ?? 0;

          return (
            <tr key={r.leave_type_id} style={{ fontSize: 14 }}>
              <td>{r.leave_type?.name ?? r.leave_type_id}</td>
              <td>{accrued}h</td>
              <td>{used}h</td>
              <td>{available}h</td>
              <td>{r.leave_type?.paid ? "Yes" : "No"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
