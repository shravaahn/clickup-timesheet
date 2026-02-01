// src/components/DashboardNavbar/DashboardNavbar.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "./DashboardNavbar.module.css";
import ThemeSwitch from "@/components/ThemeSwitch";

type Tab = "profile" | "timesheets" | "analytics" | "user-management" | "approvals" | "leave";
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
  me: _me,
}: {
  activeTab?: Tab;
  onTabChange?: (t: Tab) => void;
  me?: any;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<any>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned] = useState(false); // preserved hook
  const [theme, setTheme] = useState<Scheme>("light");

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => setMe(d?.user || null));
  }, []);

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

  const logoSrc =
    theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";

  // Extract roles from /api/me
  const roles = me?.roles || [];
  const isOwner = roles.includes("OWNER");
  const isManager = roles.includes("MANAGER");

  // Access control based on roles
  const showUserManagement = isOwner;
  const showApprovals = isOwner || isManager;

  // Handle navigation - use provided handler if available, otherwise use Next.js router
  const handleTabClick = (tab: Tab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      router.push(`/dashboard/${tab}`);
    }
  };

  // Derive active tab from pathname if not explicitly provided
  const currentTab = activeTab || (() => {
    if (pathname?.includes("/timesheets")) return "timesheets";
    if (pathname?.includes("/analytics")) return "analytics";
    if (pathname?.includes("/profile")) return "profile";
    if (pathname?.includes("/user-management")) return "user-management";
    if (pathname?.includes("/approvals")) return "approvals";
    if (pathname?.includes("/leave")) return "leave";
    return "timesheets"; // default
  })();

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

          <ThemeSwitch className={styles.themeSwitch} />
        </div>

        {/* NAV */}
        <nav className={styles.navList}>
          <button
            className={`${styles.navItem} ${currentTab === "timesheets" ? styles.active : ""}`}
            onClick={() => handleTabClick("timesheets")}
          >
            Timesheets
          </button>

          <button
            className={`${styles.navItem} ${currentTab === "analytics" ? styles.active : ""}`}
            onClick={() => handleTabClick("analytics")}
          >
            Analytics
          </button>

          <button
            className={`${styles.navItem} ${currentTab === "leave" ? styles.active : ""}`}
            onClick={() => handleTabClick("leave")}
          >
            Leave
          </button>

          {showUserManagement && (
            <button
              className={`${styles.navItem} ${currentTab === "user-management" ? styles.active : ""}`}
              onClick={() => handleTabClick("user-management")}
            >
              User Management
            </button>
          )}

          {showApprovals && (
            <button
              className={`${styles.navItem} ${currentTab === "approvals" ? styles.active : ""}`}
              onClick={() => handleTabClick("approvals")}
            >
              Approvals
            </button>
          )}

          <button
            className={`${styles.navItem} ${currentTab === "profile" ? styles.active : ""}`}
            onClick={() => handleTabClick("profile")}
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