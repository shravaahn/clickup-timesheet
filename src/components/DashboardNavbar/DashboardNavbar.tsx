// src/components/DashboardNavbar/DashboardNavbar.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./DashboardNavbar.module.css";

type Tab = "profile" | "timesheets" | "analytics" | "user-management";
type Scheme = "light" | "dark";

function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function DashboardNavbar({
  activeTab,
  onTabChange,
  me,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  me: any;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned] = useState(false); // preserved hook
  const [theme, setTheme] = useState<Scheme>("light");

  /* theme sync */
  useEffect(() => {
    setTheme(getInitialTheme());
    const onTheme = (e: Event) => {
      const t = (e as CustomEvent).detail;
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("app-theme-change", onTheme as EventListener);
    return () => window.removeEventListener("app-theme-change", onTheme as EventListener);
  }, []);

  function toggleTheme() {
    const next: Scheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("theme", next);
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: next }));
    setTheme(next);
  }

  const logoSrc =
    theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";

  // Check if user can see User Management tab
  const canSeeUserManagement = me?.is_owner || me?.is_manager;

  return (
    <>
      {/* invisible left-edge hover zone */}
      <div
        className={styles.edgeTrigger}
        onMouseEnter={() => setHovered(true)}
      />

      <aside
        className={[
          styles.sidebar,
          hovered ? styles.visible : "",
          pinned ? styles.pinned : "",
        ].join(" ")}
        onMouseLeave={() => {
          if (!pinned) setHovered(false);
        }}
      >
        {/* TOP BAR */}
        <div className={styles.topBar}>
          <img
            src={logoSrc}
            alt="Company logo"
            className={styles.topLogo}
          />

          <button
            className={styles.themeIconBtn}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
        </div>

        {/* NAV */}
        <nav className={styles.navList}>
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

          {canSeeUserManagement && (
            <button
              className={`${styles.navItem} ${activeTab === "user-management" ? styles.active : ""}`}
              onClick={() => onTabChange("user-management")}
            >
              User Management
            </button>
          )}

          <button
            className={`${styles.navItem} ${activeTab === "profile" ? styles.active : ""}`}
            onClick={() => onTabChange("profile")}
          >
            Profile
          </button>
        </nav>

        {/* FOOTER */}
        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar}>
              {(me?.username || me?.email || "U")[0]?.toUpperCase()}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>
                {me?.username || me?.email}
              </div>
              <div className={styles.userRole}>
                {me?.is_admin ? "Admin" : "Consultant"}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}