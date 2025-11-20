// src/components/DashboardNavbar/DashboardNavbar.tsx
"use client";

import React, { useEffect, useState } from "react";
import styles from "./DashboardNavbar.module.css";

type Props = {
  activeTab: "profile" | "timesheets" | "analytics";
  onTabChange: (t: "profile" | "timesheets" | "analytics") => void;
  me?: any;
};

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  // fallback to system preference
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function DashboardNavbar({ activeTab, onTabChange, me }: Props) {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);

  // Theme local state (keeps DOM attribute + localStorage + dispatches app-theme-change)
  const [theme, setTheme] = useState<"light" | "dark">(() => getInitialTheme());

  useEffect(() => { if (pinned) setVisible(true); }, [pinned]);

  useEffect(() => {
    // apply theme to document and persist
    try {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage.setItem("theme", theme);
      // dispatch same event your dashboard listens for
      window.dispatchEvent(new CustomEvent("app-theme-change", { detail: theme }));
    } catch (e) {
      // ignore on SSR or locked-down env
    }
  }, [theme]);

  // Keep in sync if other tabs change theme via storage or app-theme-change
  useEffect(() => {
    const onStorage = () => setTheme(getInitialTheme());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as "light" | "dark" | undefined;
      if (detail === "light" || detail === "dark") setTheme(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("app-theme-change", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-theme-change", onCustom as EventListener);
    };
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // logo images in public/
  const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";

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
          {/* logo (image) */}
          <div className={styles.logo}>
            <img src={logoSrc} alt="Company logo" style={{ width: "50%", height: "50%", objectFit: "contain" }} />
          </div>

          {/* pin button removed */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

            {/* theme toggle re-using pinBtn class for simple styling */}
            <button
              className={styles.pinBtn}
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
          </div>
        </div>

        <div className={styles.navList}>
          <NavItem label="Timesheets" active={activeTab === "timesheets"} onClick={() => onTabChange("timesheets")} />
          <NavItem label="Analytics" active={activeTab === "analytics"} onClick={() => onTabChange("analytics")} />
          <NavItem label="Profile" active={activeTab === "profile"} onClick={() => onTabChange("profile")} />

          {(me?.is_admin || me?.role === "admin") && (
            <>
              <div className={styles.sectionLabel}>Admin</div>
              <NavItem label="Overview" onClick={() => (window.location.href = "/admin/overview")} />
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
