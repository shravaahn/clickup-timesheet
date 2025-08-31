// src/app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

export default function LoginPage() {
  // default to light on the login screen
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (typeof window !== "undefined" && (localStorage.getItem("theme") as "light" | "dark")) || "light"
  );

  // reflect on <html data-theme=""> for CSS tokens
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
    }
  }, [theme]);

  // ✅ point at the right API route
  const startAuth = () => {
    window.location.href = "/api/auth/clickup-login";
  };

  return (
    <div className={`${styles.page} ${theme === "light" ? styles.tokensLight : styles.tokensDark}`}>
      <div className={styles.shell}>
        <div className={styles.card} role="dialog" aria-labelledby="login-title">
          <div className={styles.brandRow}>
            <div className={styles.logoBadge}>L5</div>
            <div className={styles.brandText}>
              <h1 id="login-title" className={styles.title}>Weekly Time Tracking</h1>
              <p className={styles.subtitle}>Sign in</p>
            </div>
          </div>

          <button className={styles.cta} onClick={startAuth} aria-label="Continue with ClickUp">
            <span className={styles.ctaDot} aria-hidden="true" />
            Continue with ClickUp
          </button>

          <p className={styles.note}>
            You’ll be redirected to ClickUp to grant access.
          </p>
        </div>

        {/* local toggle for the login page */}
        <button
          className={styles.themeToggle}
          onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          <span className={styles.togglePill}>
            <span className={styles.toggleThumb} data-pos={theme} />
            <span className={styles.toggleLabel}>{theme === "light" ? "Light" : "Dark"}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
