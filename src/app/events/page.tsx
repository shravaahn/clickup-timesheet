"use client";
import React, { useState } from "react";

// Types
type User = { username: string; role: "admin" | "consultant" };
type Row = { project: string; cells: Record<number, { estLocked?: boolean; est?: number; trk?: number }> };

// Props you can pass from a parent context
type Props = {
  verify: (u: string, p: string, r: string) => User | null;
  showApp: () => void;
  showLogin: () => void;
  buildHead: () => void;
  render: () => void;
  save: () => void;
  saveSilent: () => void;
  toCSV: () => string;
  getActiveIdentity: () => User;
  keyFor: (u: User, weekStart: Date) => string;
  addDays: (d: Date, n: number) => Date;
  startOfWeek: (d: Date) => Date;
  weeksInMonth: (y: number, m: number) => Date[];
  ymd: (d: Date) => string;
};

export default function Events({
  verify,
  showApp,
  showLogin,
  buildHead,
  render,
  save,
  saveSilent,
  toCSV,
  getActiveIdentity,
  keyFor,
  addDays,
  startOfWeek,
  weeksInMonth,
  ymd,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [adminViewUser, setAdminViewUser] = useState<User | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [data, setData] = useState<{ rows: Row[] }>({ rows: [] });

  /** ---------- Handlers ---------- **/
  const handleLogin = (username: string, password: string, role: string) => {
    const ok = verify(username.trim(), password.trim(), role);
    if (!ok) {
      alert("Invalid credentials for demo.");
      return;
    }
    setUser(ok);
    setAdminViewUser(null);
    showApp();
  };

  const handleLogout = () => {
    setUser(null);
    setAdminViewUser(null);
    showLogin();
  };

  const handleAddRow = () => {
    if (viewMode === "week") {
      setData((prev) => ({ rows: [...prev.rows, { project: "", cells: {} }] }));
      render();
    } else {
      const who = getActiveIdentity();
      const raw = localStorage.getItem(keyFor(who, weekStart));
      const obj = raw ? JSON.parse(raw) : { rows: [] };
      obj.rows.push({ project: "", cells: {} });
      localStorage.setItem(keyFor(who, weekStart), JSON.stringify(obj));
      render();
    }
  };

  const handleExportCsv = () => {
    const csv = toCSV();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const period =
      viewMode === "week"
        ? ymd(weekStart)
        : `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}`;
    a.download = `timesheet_${getActiveIdentity().username}_${period}.csv`;
    a.click();
  };

  const handlePrevWeek = () => {
    setWeekStart((prev) => {
      const newDate = addDays(prev, -7);
      buildHead();
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setWeekStart((prev) => {
      const newDate = addDays(prev, +7);
      buildHead();
      return newDate;
    });
  };

  const handleThisWeek = () => {
    const now = startOfWeek(new Date());
    setWeekStart(now);
    buildHead();
  };

  const handleUnlockAll = () => {
    if (user?.role !== "admin") return;
    if (!confirm(`Unlock all estimate fields for visible ${viewMode}?`)) return;

    if (viewMode === "week") {
      const updated = {
        rows: (data.rows || []).map((row) => {
          const newCells: Row["cells"] = { ...row.cells };
          for (let d = 0; d < 5; d++) {
            if (newCells[d]) newCells[d].estLocked = false;
          }
          return { ...row, cells: newCells };
        }),
      };
      setData(updated);
      saveSilent();
      render();
    } else {
      const who = getActiveIdentity();
      const y = weekStart.getFullYear(),
        m = weekStart.getMonth();
      weeksInMonth(y, m).forEach((mon) => {
        const k = keyFor(who, mon);
        const obj = JSON.parse(localStorage.getItem(k) || '{"rows":[]}');
        (obj.rows || []).forEach((row: Row) => {
          for (let d = 0; d < 5; d++) {
            if (!row.cells?.[d]) continue;
            row.cells[d].estLocked = false;
          }
        });
        localStorage.setItem(k, JSON.stringify(obj));
      });
      render();
    }
  };

  const handleSwitchView = (mode: "week" | "month") => {
    if (viewMode !== mode) {
      setViewMode(mode);
      // update buttons etc.
      buildHead();
      if (mode === "week") load();
      else render();
    }
  };

  /** ---------- UI Buttons ---------- **/
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => handleLogin("consultant", "demo", "consultant")} className="btn">
        Login
      </button>
      <button onClick={handleLogout} className="btn">
        Logout
      </button>
      <button onClick={handleAddRow} className="btn">
        Add Row
      </button>
      <button onClick={save} className="btn">
        Save All
      </button>
      <button onClick={handleExportCsv} className="btn">
        Export CSV
      </button>
      <button onClick={handlePrevWeek} className="btn">
        Prev Week
      </button>
      <button onClick={handleNextWeek} className="btn">
        Next Week
      </button>
      <button onClick={handleThisWeek} className="btn">
        This Week
      </button>
      <button onClick={handleUnlockAll} className="btn">
        Unlock All
      </button>
      <button onClick={() => handleSwitchView("week")} className="btn">
        Week View
      </button>
      <button onClick={() => handleSwitchView("month")} className="btn">
        Month View
      </button>
    </div>
  );
}
function load() {
    throw new Error("Function not implemented.");
}

