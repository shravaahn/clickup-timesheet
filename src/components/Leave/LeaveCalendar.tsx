//src/components/Leave/LeaveCalendar.tsx
"use client";

import { useEffect, useState, useMemo } from "react";

type Holiday = { date: string; name: string };
type Leave = { start_date: string; end_date: string; type: string; paid: boolean };

export default function LeaveCalendar() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/leave/calendar")
      .then(r => r.json())
      .then(j => {
        setHolidays(j.holidays || []);
        setLeaves(j.leaves || []);
      })
      .catch(() => {
        // Silent fail
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Generate calendar for current month
  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);

    // Day of week for first day (0 = Sunday)
    const firstDayOfWeek = firstDay.getDay();

    // Total days in month
    const daysInMonth = lastDay.getDate();

    const days: Array<{
      date: number | null;
      dateStr: string | null;
      isToday: boolean;
      isWeekend: boolean;
      holiday: Holiday | null;
      leave: { type: string; paid: boolean } | null;
    }> = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        date: null,
        dateStr: null,
        isToday: false,
        isWeekend: false,
        holiday: null,
        leave: null,
      });
    }

    // Add actual days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday =
        d === now.getDate() &&
        month === now.getMonth() &&
        year === now.getFullYear();

      // Check if this date is a holiday
      const holiday = holidays.find(h => h.date === dateStr) || null;

      // Check if this date falls within an approved leave
      const leave = leaves.find(l => {
        return dateStr >= l.start_date && dateStr <= l.end_date;
      });

      days.push({
        date: d,
        dateStr,
        isToday,
        isWeekend,
        holiday,
        leave: leave ? { type: leave.type, paid: leave.paid } : null,
      });
    }

    return days;
  }, [holidays, leaves]);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const now = new Date();
  const currentMonthName = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>
        Loading calendar...
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h4 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
        {currentMonthName} {currentYear}
      </h4>

      {/* Calendar Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div
            key={day}
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 600,
              padding: 8,
              color: "var(--muted)",
            }}
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, idx) => {
          if (day.date === null) {
            // Empty cell
            return (
              <div
                key={`empty-${idx}`}
                style={{
                  minHeight: 60,
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  backgroundColor: "var(--panel)",
                }}
              />
            );
          }

          // Determine background color
          let bgColor = "var(--panel)";
          let tooltipParts: string[] = [];

          if (day.holiday) {
            bgColor = "#fef3c7"; // Yellow for holidays
            tooltipParts.push(`Holiday: ${day.holiday.name}`);
          }

          if (day.leave) {
            if (day.leave.paid) {
              bgColor = "#d1fae5"; // Green for paid leave
              tooltipParts.push(`Paid Leave: ${day.leave.type}`);
            } else {
              bgColor = "#fee2e2"; // Red for unpaid leave
              tooltipParts.push(`Unpaid Leave: ${day.leave.type}`);
            }
          }

          if (day.isWeekend && !day.holiday && !day.leave) {
            bgColor = "#f3f4f6"; // Light gray for weekends
          }

          const tooltip = tooltipParts.length > 0 ? tooltipParts.join(" | ") : "";

          return (
            <div
              key={`day-${idx}`}
              title={tooltip}
              style={{
                minHeight: 60,
                border: day.isToday ? "2px solid var(--primary)" : "1px solid var(--border)",
                borderRadius: 4,
                backgroundColor: bgColor,
                padding: 4,
                position: "relative",
                cursor: tooltip ? "help" : "default",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => {
                if (tooltip) {
                  e.currentTarget.style.transform = "scale(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: day.isToday ? 700 : 500,
                  color: day.isWeekend ? "var(--muted)" : "var(--text)",
                }}
              >
                {day.date}
              </div>
              {day.holiday && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#92400e",
                    marginTop: 2,
                    fontWeight: 600,
                  }}
                >
                  Holiday
                </div>
              )}
              {day.leave && (
                <div
                  style={{
                    fontSize: 10,
                    color: day.leave.paid ? "#065f46" : "#991b1b",
                    marginTop: 2,
                    fontWeight: 600,
                  }}
                >
                  {day.leave.paid ? "Paid" : "Unpaid"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#fef3c7",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Holiday</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#d1fae5",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Paid Leave</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#fee2e2",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Unpaid Leave</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#f3f4f6",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Weekend</span>
        </div>
      </div>
    </div>
  );
}