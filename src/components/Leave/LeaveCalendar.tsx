//src/components/Leave/LeaveCalendar.tsx
"use client";

import { useEffect, useState } from "react";

type Holiday = { date: string; name: string };
type Leave = { start_date: string; end_date: string; type: string };

export default function LeaveCalendar() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);

  useEffect(() => {
    fetch("/api/leave/calendar")
      .then(r => r.json())
      .then(j => {
        setHolidays(j.holidays || []);
        setLeaves(j.leaves || []);
      });
  }, []);

  return (
    <div>
      <h4>Calendar Overview</h4>

      <div style={{ marginTop: 8 }}>
        <strong>Holidays</strong>
        {holidays.map(h => (
          <div key={h.date}>
            {h.date} • {h.name}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Approved Leaves</strong>
        {leaves.map((l, i) => (
          <div key={i}>
            {l.start_date} → {l.end_date} ({l.type})
          </div>
        ))}
      </div>
    </div>
  );
}
