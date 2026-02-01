"use client";

import { useEffect, useState } from "react";
import styles from "@/app/dashboard/Dashboard.module.css";

type LeaveType = {
  id: string;
  name: string;
  code: string;
  paid: boolean;
};

export default function ApplyLeaveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

    (async () => {
      const r = await fetch("/api/leave/balances", { cache: "no-store" });
      const j = await r.json();
      const mapped =
        (j.balances || []).map((b: any) => ({
          id: b.leave_type_id,
          name: b.leave_type.name,
          code: b.leave_type.code,
          paid: b.leave_type.paid,
        })) || [];

      setLeaveTypes(mapped);
    })();
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!leaveTypeId || !startDate || !endDate) {
      alert("Please fill all required fields");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/leave/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId,
          startDate,
          endDate,
          reason,
        }),
      });

      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Failed to apply leave");
        return;
      }

      onClose();
      alert("Leave request submitted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Apply Leave</h3>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.label}>Leave Type</label>
          <select
            className={styles.select}
            value={leaveTypeId}
            onChange={e => setLeaveTypeId(e.target.value)}
          >
            <option value="">— Select —</option>
            {leaveTypes.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.paid ? "(Paid)" : "(Unpaid)"}
              </option>
            ))}
          </select>

          <label className={styles.label}>Start Date</label>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />

          <label className={styles.label}>End Date</label>
          <input
            type="date"
            className={styles.input}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />

          <label className={styles.label}>Reason (optional)</label>
          <textarea
            className={styles.textarea}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.primary}`}
            disabled={busy}
            onClick={submit}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
