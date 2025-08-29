"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

type Theme = "light" | "dark";

export default function LoginPage() {
  const [theme, setTheme] = useState<Theme>("light");

  // Read saved preference or system
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      const prefersDark =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  // Persist + expose on <html data-theme="">
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      try { localStorage.setItem("theme", theme); } catch {}
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <main className={`${styles.page} ${theme === "light" ? styles.light : styles.dark}`}>
      <div className={styles.card}>
        <div className={styles.brandRow}>
          <div className={styles.logoWrap}>
            <img
              className={styles.logoImg}
              src="/company-logo.png"
              alt="Company"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const sib = document.createElement("div");
                sib.className = styles.logoFallback;
                sib.textContent = "L5";
                (e.currentTarget.parentElement as HTMLElement).appendChild(sib);
              }}
            />
          </div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Weekly Time Tracking</h1>
            <p className={styles.subtitle}>Sign in to continue</p>
          </div>
        </div>

        <a href="/api/auth/clickup" className={styles.cta} aria-label="Continue with ClickUp">
          <span className={styles.ctaIcon} aria-hidden>↪</span>
          Continue with ClickUp
        </a>

        <p className={styles.note}>You’ll be redirected to ClickUp to grant access.</p>
      </div>

      {/* Theme toggle (no overlap with anything) */}
      <button className={styles.themeToggle} onClick={toggleTheme}>
        <span className={styles.toggleDot} />
        {theme === "light" ? "Light" : "Dark"}
      </button>
    </main>
  );
}
