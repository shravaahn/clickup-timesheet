"use client";

import { useEffect, useState } from "react";

// ===== Types =====
type User = {
  username: string;
  role: "consultant" | "admin";
};

// ===== Helpers from your earlier code (adapted) =====
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function niceDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function weeksInMonth(year: number, monthIndex: number): Date[] {
  const res: Date[] = [];
  const firstOfMonth = new Date(year, monthIndex, 1);
  let m = startOfWeek(firstOfMonth);
  while (m.getMonth() <= monthIndex) {
    if (m.getMonth() === monthIndex) res.push(new Date(m));
    m = addDays(m, 7);
    if (m.getMonth() > monthIndex && m.getDate() > 7) break;
  }
  return res;
}
function labelWeekRange(monday: Date): string {
  const fri = addDays(monday, 4);
  return `${niceDate(monday)} — ${niceDate(fri)}`;
}
function buildMonthOptions(current: Date): Date[] {
  const out: Date[] = [];
  const base = new Date(current);
  base.setDate(1);
  for (let i = -5; i <= 6; i++) {
    out.push(new Date(base.getFullYear(), base.getMonth() + i, 1));
  }
  return out;
}

// ===== LocalStorage util to find consultants =====
function listConsultantsFromStorage(): string[] {
  const set = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("tt.v1::")) continue;
    const parts = k.split("::");
    if (parts.length !== 4) continue;
    const uname = parts[1];
    const role = parts[2];
    if (role === "consultant") set.add(uname);
  }
  return Array.from(set).sort();
}

// ===== React Component =====
export default function AdminPickers() {
  const [consultants, setConsultants] = useState<string[]>([]);
  const [selectedConsultant, setSelectedConsultant] = useState<string>("");
  const [adminViewUser, setAdminViewUser] = useState<User | null>(null);

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [monthOptions, setMonthOptions] = useState<Date[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [weekOptions, setWeekOptions] = useState<Date[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");

  // Load consultants from storage
  useEffect(() => {
    setConsultants(listConsultantsFromStorage());
  }, []);

  // Build month options based on weekStart
  useEffect(() => {
    const months = buildMonthOptions(weekStart);
    setMonthOptions(months);
    setSelectedMonth(`${weekStart.getFullYear()}-${weekStart.getMonth()}`);
  }, [weekStart]);

  // Build week options whenever month changes
  useEffect(() => {
    if (!selectedMonth) return;
    const [yStr, mStr] = selectedMonth.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const mondays = weeksInMonth(y, m);
    setWeekOptions(mondays);

    // auto-select matching week
    const wkKey = ymd(weekStart);
    const match = mondays.find((mon) => ymd(mon) === wkKey);
    if (match) {
      setSelectedWeek(ymd(match));
    } else if (mondays.length) {
      setSelectedWeek(ymd(mondays[0]));
      setWeekStart(startOfWeek(mondays[0]));
    }
  }, [selectedMonth, weekStart]);

  function handleConsultantChange(val: string) {
    setSelectedConsultant(val);
    if (val) {
      const u = { username: val, role: "consultant" as const };
      setAdminViewUser(u);
    } else {
      setAdminViewUser(null);
    }
  }

  function handleMonthChange(val: string) {
    setSelectedMonth(val);
  }

  function handleWeekChange(val: string) {
    setSelectedWeek(val);
    setWeekStart(startOfWeek(new Date(val)));
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-sm font-semibold">Consultant</label>
        <select
          className="border p-2 rounded w-full"
          value={selectedConsultant}
          onChange={(e) => handleConsultantChange(e.target.value)}
        >
          <option value="">— Select consultant —</option>
          {consultants.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {consultants.length
            ? `${consultants.length} found`
            : "No consultants found yet"}
        </p>
      </div>

      {adminViewUser && (
        <div className="text-sm text-blue-600 font-medium">
          Viewing: {adminViewUser.username}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold">Month</label>
        <select
          className="border p-2 rounded w-full"
          value={selectedMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
        >
          {monthOptions.map((m) => (
            <option
              key={`${m.getFullYear()}-${m.getMonth()}`}
              value={`${m.getFullYear()}-${m.getMonth()}`}
            >
              {m.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold">Week</label>
        <select
          className="border p-2 rounded w-full"
          value={selectedWeek}
          onChange={(e) => handleWeekChange(e.target.value)}
        >
          {weekOptions.map((mon, idx) => (
            <option key={ymd(mon)} value={ymd(mon)}>
              Week {idx + 1}: {labelWeekRange(mon)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}