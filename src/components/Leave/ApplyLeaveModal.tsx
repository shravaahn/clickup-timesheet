// src/components/Leave/ApplyLeaveModal.tsx
"use client";

import { useState } from "react";
import styles from "@/app/dashboard/Dashboard.module.css";

export default function ApplyLeaveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  if (!open) return null;

  async function submit() {
    const r = await fetch("/api/leave/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveTypeId,
        startDate: start,
        endDate: end,
        reason,
      }),
    });

    if (!r.ok) {
      alert("Failed to apply leave");
      return;
    }

    onClose();
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Apply Leave</div>
        </div>

        <div className={styles.modalBody}>
          <input placeholder="Leave Type ID" value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)} />
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          <textarea placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={submit}>Submit</button>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
