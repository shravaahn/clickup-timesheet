//src/components/Leave/LeaveCalendar.tsx
"use client";

import { useEffect, useState, useMemo } from "react";

type Holiday = { date: string; name: string };
type Leave = { start_date: string; end_date: string; type: string; paid: boolean };

export default function LeaveCalendar() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);

  // Month navigation state
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leave/calendar?year=${currentYear}`)
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
  }, [currentYear]);

  // Generate calendar for selected month
  const calendarDays = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);

    // Day of week for first day (0 = Sunday, 1 = Monday, etc.)
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
        d === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear();

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
  }, [holidays, leaves, currentMonth, currentYear]);

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

  const handlePreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
        Loading calendar...
      </div>
    );
  }

  return (
    <div>
      {/* Month Navigation Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <button
          onClick={handlePreviousMonth}
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
          }}
          aria-label="Previous month"
        >
          ◀
        </button>

        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {monthNames[currentMonth]} {currentYear}
        </div>

        <button
          onClick={handleNextMonth}
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
          }}
          aria-label="Next month"
        >
          ▶
        </button>
      </div>

      {/* Calendar Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
          marginBottom: 16,
        }}
      >
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div
            key={day}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              padding: "8px 4px",
              color: "var(--muted)",
              textTransform: "uppercase",
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
                  minHeight: 80,
                  backgroundColor: "transparent",
                }}
              />
            );
          }

          // Determine background color based on priority: leave > holiday > weekend
          let bgColor = "var(--bg)";
          let borderColor = "var(--border)";
          
          if (day.isWeekend) {
            bgColor = "var(--panel)";
          }

          if (day.holiday) {
            bgColor = "#e5e7eb"; // Gray for holidays
          }

          if (day.leave) {
            if (day.leave.paid) {
              bgColor = "#dbeafe"; // Blue for paid leave
            } else {
              bgColor = "#fed7aa"; // Orange for unpaid leave
            }
          }

          if (day.isToday) {
            borderColor = "var(--primary)";
          }

          return (
            <div
              key={`day-${idx}`}
              style={{
                minHeight: 80,
                border: `1px solid ${borderColor}`,
                borderRadius: 4,
                backgroundColor: bgColor,
                padding: 6,
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: day.isToday ? 700 : 500,
                  marginBottom: 4,
                }}
              >
                {day.date}
              </div>
              
              {day.holiday && (
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    color: "#374151",
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  🎉 {day.holiday.name}
                </div>
              )}
              
              {day.leave && (
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    color: day.leave.paid ? "#1e40af" : "#c2410c",
                    fontWeight: 600,
                  }}
                >
                  {day.leave.paid ? "📅" : "📋"} {day.leave.type}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#e5e7eb",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Holiday</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#dbeafe",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Paid Leave</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#fed7aa",
              border: "1px solid var(--border)",
              borderRadius: 2,
            }}
          />
          <span>Unpaid Leave</span>
        </div>
      </div>
    </div>
  );
}