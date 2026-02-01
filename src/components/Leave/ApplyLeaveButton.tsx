"use client";

import styles from "@/app/dashboard/Dashboard.module.css";

export default function ApplyLeaveButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.btn} ${styles.primary}`}
      onClick={onClick}
    >
      Apply Leave
    </button>
  );
}
