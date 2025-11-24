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

        {/* --- SMALL TOP BAR (logo + tiny theme switch) --- */}
        <div className={styles.topBar}>
          <img src={logoSrc} className={styles.topLogo} alt="Logo" />

          <button className={styles.themeIconBtn}>
            <ThemeSwitch />
          </button>
        </div>

        {/* ---------------- NAVIGATION ---------------- */}
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

        {/* ---------------- FOOTER ---------------- */}
        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar}>
              {me?.username ? me.username.charAt(0).toUpperCase() : "U"}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{me?.username || me?.email}</div>
              <div className={styles.userRole}>{me?.is_admin ? "Admin" : "Consultant"}</div>
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
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}
