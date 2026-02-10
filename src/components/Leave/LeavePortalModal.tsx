// src/components/Leave/LeavePortalModal.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "@/app/dashboard/Dashboard.module.css";
import LeaveCalendar from "./LeaveCalendar";
import ApplyLeaveModal from "./ApplyLeaveModal";

type Balance = {
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

export default function LeavePortalModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    fetch("/api/leave/balances")
      .then(r => r.json())
      .then(j => setBalances(j.balances || []));
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Leave Portal</div>
        </div>

        <div className={styles.modalBody}>
          <section>
            <h4>Leave Balances</h4>
            {balances.length === 0 && <div>No balances available</div>}
            {balances.map(b => (
              <div key={b.leave_type_id}>
                {b.leave_type_id}: {(b.balance_hours ?? 0)}h remaining
              </div>
            ))}
          </section>

          <section style={{ marginTop: 16 }}>
            <LeaveCalendar />
          </section>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={() => setApplyOpen(true)}>
            Apply Leave
          </button>
          <button className={styles.btn} onClick={onClose}>
            Close
          </button>
        </div>

        <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} />
      </div>
    </div>
  );
}
