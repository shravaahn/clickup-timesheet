"use client";

import { useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Edge Trigger: Invisible strip to capture hover and reveal sidebar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "20px",
          zIndex: 49,
          cursor: "pointer",
        }}
        onMouseEnter={() => setIsExpanded(true)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={styles.sidebar}
        onMouseLeave={() => setIsExpanded(false)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 50,
          transform: isExpanded ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s ease-in-out",
          boxShadow: isExpanded ? "4px 0 12px rgba(0,0,0,0.15)" : "none",
          backgroundColor: "var(--background, #fff)", // Fallback if CSS module is missing bg
        }}
      >
        <div className={styles.brand}>
          <span className={styles.logo}>MTT</span>
        </div>

        <nav className={styles.nav}>
          <button
            className={`${styles.navItem} ${activeTab === "timesheets" ? styles.active : ""}`}
            onClick={() => {
              onTabChange("timesheets");
              setIsExpanded(false);
            }}
          >
            Timesheets
          </button>

          <button
            className={`${styles.navItem} ${activeTab === "analytics" ? styles.active : ""}`}
            onClick={() => {
              onTabChange("analytics");
              setIsExpanded(false);
            }}
          >
            Analytics
          </button>

          <button
            className={`${styles.navItem} ${activeTab === "user-management" ? styles.active : ""}`}
            onClick={() => {
              onTabChange("user-management");
              setIsExpanded(false);
            }}
          >
            User Management
          </button>

          <button
            className={`${styles.navItem} ${activeTab === "profile" ? styles.active : ""}`}
            onClick={() => {
              onTabChange("profile");
              setIsExpanded(false);
            }}
          >
            Profile
          </button>
        </nav>

        <div className={styles.footer}>
          <div className={styles.user}>{me?.username || me?.email}</div>
        </div>
      </aside>
    </>
  );
}