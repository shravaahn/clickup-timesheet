// src/app/dashboard/user-management/page.tsx

"use client";

import { useEffect, useState } from "react";
import styles from "../Dashboard.module.css";
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";
import UserManagementSection from "@/components/UserManagement/UserManagement";

/* ---------- Theme helpers ---------- */
type Scheme = "light" | "dark";
function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

/** ---- types ---- */
type Me = { user: { id: string; email: string; username?: string; is_admin?: boolean; is_owner?: boolean; is_manager?: boolean } };

export default function UserManagementPage() {
  /* theme sync (read only) */
  const [theme, setTheme] = useState<Scheme>("light");
  useEffect(() => {
    setTheme(getInitialTheme());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as Scheme | undefined;
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

  /** auth + role */
  const [me, setMe] = useState<Me["user"] | null>(null);

  /* load me */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/me", { cache: "no-store" });
        if (resp.status === 401) { window.location.href = "/login"; return; }
        const meRes: Me = await resp.json();
        const u = meRes?.user;
        if (!mounted) return;
        if (!u?.id) { window.location.href = "/login"; return; }

        setMe(u);

        // Redirect if not authorized (OWNER or MANAGER only)
        const canAccess = u.is_owner || u.is_manager;
        if (!canAccess) {
          window.location.href = "/dashboard/timesheets";
          return;
        }
      } catch {
        window.location.href = "/login";
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* Tab header component */
  function TabHeader() {
    const logoSrc = theme === "dark" ? "/company-logo-dark.png" : "/company-logo-light.png";
    return (
      <div className={styles.brandBar} style={{ marginBottom: 12 }}>
        <div className={styles.brandLeft}>
          <img className={styles.brandLogo} src={logoSrc} alt="Company logo" />
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>User Management</div>
            <div className={styles.brandTagline}>Manage users, roles, and teams</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <DashboardNavbar activeTab="user-management" onTabChange={(t) => window.location.href = `/dashboard/${t}`} me={me} />

      <div style={{ flex: 1, marginLeft: 0 }}>
        <div className={styles.page} data-theme={theme}>
          <div className={styles.shell}>
            <TabHeader />
            
            {/* Wrap the existing UserManagementSection component */}
            <div style={{ marginTop: 12 }}>
              <UserManagementSection />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}