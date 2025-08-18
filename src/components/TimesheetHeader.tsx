"use client";

import { useMemo } from "react";

type Props = {
  username: string;
  role: "consultant" | "admin";
  weekRangeLabel: string;
  viewingUser?: string | null;

  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  onAddRow?: () => void;
  onSave?: () => void;
  onExportCsv?: () => void;
  onLogout?: () => void;
};

export default function TimesheetHeader({
  username,
  role,
  viewingUser,
  weekRangeLabel,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onAddRow,
  onSave,
  onExportCsv,
  onLogout,
}: Props) {
  const roleBadge = useMemo(
    () => `${username} — ${role.toUpperCase()}`,
    [username, role]
  );

  return (
    <header className="appbar">
      <div className="brand">
        <div className="logo">TT</div>
        <div>
          <div style={{ fontWeight: 800 }}>Time Tracking</div>
          <div className="muted">{weekRangeLabel}</div>
        </div>
      </div>

      <div className="controls">
        <span id="userBadge" className="role-badge">{roleBadge}</span>
        {viewingUser ? (
          <span id="viewingBadge" className="role-badge">
            Viewing: {viewingUser}
          </span>
        ) : null}

        <button className="ghost" onClick={onPrevWeek}>◀ Prev</button>
        <button className="ghost" title="Jump to current week" onClick={onThisWeek}>
          This Week
        </button>
        <button className="ghost" onClick={onNextWeek}>Next ▶</button>

        <button onClick={onAddRow}>+ Add Project</button>
        <button className="success" onClick={onSave}>Save</button>
        <button onClick={onExportCsv}>Export CSV</button>
        <button className="warn" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}
