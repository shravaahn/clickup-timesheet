// src/components/DashboardNavbar/DashboardNavbar.tsx
"use client";

import React, { useEffect, useState } from "react";
import styles from "./DashboardNavbar.module.css";

type Props = {
  activeTab: "profile" | "timesheets" | "analytics";
  onTabChange: (t: "profile" | "timesheets" | "analytics") => void;
  me?: any;
};

export default function DashboardNavbar({ activeTab, onTabChange, me }: Props) {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => { if (pinned) setVisible(true); }, [pinned]);

  return (
    <>
      <div
        className={styles.edgeTrigger}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => { if (!pinned) setVisible(false); }}
      />

      <aside
        className={`${styles.sidebar} ${visible ? styles.visible : ""} ${pinned ? styles.pinned : ""}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => { if (!pinned) setVisible(false); }}
        aria-hidden={!visible && !pinned ? "true" : "false"}
      >
        <div className={styles.header}>
          <div className={styles.logo}>L5.AI</div>
          <button
            className={styles.pinBtn}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? "Unpin" : "Pin"}
            aria-pressed={pinned}
          >
            {pinned ? "▣" : "▢"}
          </button>
        </div>

        <div className={styles.navList}>
          <NavItem label="Timesheets" active={activeTab === "timesheets"} onClick={() => onTabChange("timesheets")} />
          <NavItem label="Analytics" active={activeTab === "analytics"} onClick={() => onTabChange("analytics")} />
          <NavItem label="Profile" active={activeTab === "profile"} onClick={() => onTabChange("profile")} />

          {(me?.is_admin || me?.role === "admin") && (
            <>
              <div className={styles.sectionLabel}>Admin</div>
              <NavItem label="Overview" onClick={() => (window.location.href = "/admin")} />
              <NavItem label="Unlock Estimates" onClick={() => (window.location.href = "/admin/estimates")} />
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar} aria-hidden>{me?.username ? me.username.charAt(0).toUpperCase() : "U"}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{me?.username || me?.email || "Unknown"}</div>
              <div className={styles.userRole}>{me?.is_admin || me?.role === "admin" ? "Admin" : "Consultant"}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavItem({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      className={`${styles.navItem} ${active ? styles.active : ""}`}
      onClick={() => onClick && onClick()}
      aria-current={active ? "page" : undefined}
    >
      <div>{label}</div>
    </button>
  );
}
