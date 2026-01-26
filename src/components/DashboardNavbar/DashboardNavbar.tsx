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
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function DashboardNavbar({ activeTab, onTabChange, me }: Props) {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    if (pinned) setVisible(true);
  }, [pinned]);

  const logoSrc =
    theme === "dark"
      ? "/company-logo-dark.png"
      : "/company-logo-light.png";

  const isOwner = me?.roles?.includes?.("OWNER");

  return (
    <>
      <div
        className={styles.edgeTrigger}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => !pinned && setVisible(false)}
      />

      <aside
        className={`${styles.sidebar} ${visible ? styles.visible : ""} ${
          pinned ? styles.pinned : ""
        }`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => !pinned && setVisible(false)}
      >
        <div className={styles.topBar}>
          <img src={logoSrc} className={styles.topLogo} alt="Logo" />
          <ThemeSwitch />
        </div>

        <div className={styles.navList}>
          <NavItem
            label="Timesheets"
            active={activeTab === "timesheets"}
            onClick={() => onTabChange("timesheets")}
          />
          <NavItem
            label="Analytics"
            active={activeTab === "analytics"}
            onClick={() => onTabChange("analytics")}
          />
          <NavItem
            label="Profile"
            active={activeTab === "profile"}
            onClick={() => onTabChange("profile")}
          />

          {isOwner && (
            <>
              <div className={styles.sectionLabel}>Admin</div>
              <NavItem
                label="User Management"
                onClick={() => (window.location.href = "/admin/users")}
              />
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar}>
              {me?.username?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>
                {me?.username || me?.email}
              </div>
              <div className={styles.userRole}>
                {isOwner ? "Owner" : "Consultant"}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`${styles.navItem} ${active ? styles.active : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
