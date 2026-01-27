"use client";

import styles from "./DashboardNavbar.module.css";

type Tab = "profile" | "timesheets" | "analytics" | "user-management";

export default function DashboardNavbar({
  activeTab,
  onTabChange,
  me,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  me: any;
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.logo}>MTT</span>
      </div>

      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${activeTab === "timesheets" ? styles.active : ""}`}
          onClick={() => onTabChange("timesheets")}
        >
          Timesheets
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "analytics" ? styles.active : ""}`}
          onClick={() => onTabChange("analytics")}
        >
          Analytics
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "user-management" ? styles.active : ""}`}
          onClick={() => onTabChange("user-management")}
        >
          User Management
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "profile" ? styles.active : ""}`}
          onClick={() => onTabChange("profile")}
        >
          Profile
        </button>
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>{me?.username || me?.email}</div>
      </div>
    </aside>
  );
}
