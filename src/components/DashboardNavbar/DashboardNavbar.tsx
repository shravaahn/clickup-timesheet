// src/components/DashboardNavbar/DashboardNavbar.tsx
"use client";

import React, { useEffect, useState } from "react";
import styles from "./DashboardNavbar.module.css";
import ThemeSwitch from "@/components/ThemeSwitch";

type Props = {
  activeTab: "profile" | "timesheets" | "analytics";
  onTabChange: (t: "profile" | "timesheets" | "analytics") => void;
  me?: any;
};

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored as "light" | "dark";
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function DashboardNavbar({ activeTab, onTabChange, me }: Props) {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => getInitialTheme());

  useEffect(() => {
    if (pinned) setVisible(true);
  }, [pinned]);

  // keep theme in sync (so Navbar can show correct logo variant if needed)
  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as "light" | "dark" | undefined;
      if (detail === "light" || detail === "dark") setTheme(detail);
    };
    const onStorage = () => setTheme(getInitialTheme());
    window.addEventListener("app-theme-change", onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("app-theme-change", onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className={styles.logo}>
              {/* keep small & responsive */}
              <img src={logoSrc} alt="Company logo" style={{ width: 40, height: 40, objectFit: "contain" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <div style={{ fontWeight: 700 }}>Timesheet</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{me?.username ? me.username : ""}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ThemeSwitch />
            <button
              className={styles.pinBtn}
              onClick={() => setPinned((p) => !p)}
              title={pinned ? "Unpin" : "Pin"}
              aria-pressed={pinned}
              style={{ padding: "6px 8px" }}
            >
              {pinned ? "▣" : "▢"}
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
