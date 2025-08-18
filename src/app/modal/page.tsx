"use client";
import { useEffect, useRef, useState } from "react";

/** ===== Types ===== */
export interface CellData {
  tracked?: number | "";
  trackedMeta?: {
    type: string;
    subType: string;
  };
}

export interface RowData {
  project?: string;
  cells?: Record<number, CellData>;
}

export interface ModalCtx {
  wkMon: Date;
  row: RowData;
  dayIdx: number; // 0 = Mon, 1 = Tue ...
  c: CellData;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  ctx?: ModalCtx;
  onSave: (ctx: ModalCtx, data: { type: string; subType: string; tracked: number | "" }) => void;
}

/** ===== Component ===== */
export default function TimeEntryModal({ isOpen, onClose, ctx, onSave }: ModalProps) {
  const [timeType, setTimeType] = useState("");
  const [subType, setSubType] = useState("");
  const [hours, setHours] = useState<string>("");
  const [contextText, setContextText] = useState("—");

  const hoursRef = useRef<HTMLInputElement>(null);

  // preload values when context changes
  useEffect(() => {
    if (!ctx) return;
    const proj = ctx.row?.project || "(Untitled Project)";
    const theDay = ["Mon", "Tue", "Wed", "Thu", "Fri"][ctx.dayIdx];
    const dateStr = niceDate(addDays(ctx.wkMon, ctx.dayIdx));
    setContextText(`${proj} • ${theDay} • ${dateStr}`);

    setTimeType(ctx.c?.trackedMeta?.type || "");
    setSubType(ctx.c?.trackedMeta?.subType || "");
    setHours(ctx.c?.tracked?.toString() ?? "");

    setTimeout(() => hoursRef.current?.focus(), 10);
  }, [ctx, isOpen]);

  const toggleSubTypeVisible = () => {
    const v = (timeType || "").trim().toLowerCase();
    return v === "non billable | internal projects";
  };

  const handleSave = () => {
    if (!ctx) return;
    const cleanHours: number | "" = hours.trim() === "" ? "" : Number(hours);
    const data = {
      type: timeType,
      subType,
      tracked: cleanHours,
    };
    onSave(ctx, data);
    onClose();
  };

  // Escape key closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="modalBackdrop"
      className="modal-backdrop flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === "modalBackdrop") onClose();
      }}
    >
      <div className="modal">
        <header className="flex items-center gap-2">
          <h3 id="modalTitle">Time Entry</h3>
          <span className="badge">{contextText}</span>
        </header>

        {/* Type */}
        <div className="row">
          <label>
            Type
            <select value={timeType} onChange={(e) => setTimeType(e.target.value)}>
              <option value="">— Select —</option>
              <option>billable | Meeting</option>
              <option>billable | Builds</option>
              <option>billable | Client Correspondence</option>
              <option>PTO</option>
              <option>Holiday</option>
              <option>Non BIllable | Internal Team Meeting</option>
              <option>Non BIllable | Internal Projects</option>
              <option>Non BIllable | L&amp;D</option>
              <option>Non BIllable | PreSales/Sales</option>
              <option>Non BIllable | Client Research</option>
              <option>Non BIllable | Partner Engagement</option>
            </select>
          </label>
        </div>

        {/* Sub Type */}
        {toggleSubTypeVisible() && (
          <div className="row" id="subTypeRow">
            <label>
              Sub Type
              <select value={subType} onChange={(e) => setSubType(e.target.value)}>
                <option value="">— Select —</option>
                <option>Firm Initiative</option>
                <option>Internal Delivery project</option>
                <option>Recruitment</option>
                <option>Special Projects</option>
                <option>Events</option>
              </select>
            </label>
          </div>
        )}

        {/* Hours */}
        <div className="row two">
          <label>
            Hours
            <input
              type="number"
              min="0"
              step="0.25"
              placeholder="e.g., 1.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              ref={hoursRef}
            />
          </label>
          <div>
            <div className="help">
              Only Hours will show in the table. All fields are saved for reporting.
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex justify-end gap-2">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={handleSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ===== Helpers ===== */
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function niceDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}