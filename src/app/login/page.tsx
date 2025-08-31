"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

export default function LoginPage() {
  // Read current theme from <html data-theme="..."> set by Layout/ThemeSwitch
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const t =
      (document?.documentElement?.dataset?.theme as "light" | "dark") ||
      (typeof window !== "undefined" &&
      window.localStorage.getItem("theme") === "light"
        ? "light"
        : "dark");
    setTheme(t);
  }, []);

  const startAuth = () => {
    // Correct OAuth starter, matches your route file
    window.location.href = "/api/auth/clickup-login";
  };

  return (
    <div
      className={`${styles.page} ${
        theme === "light" ? styles.tokensLight : styles.tokensDark
      }`}
    >
      <div className={styles.shell}>
        <div className={styles.card} role="dialog" aria-labelledby="login-title">
          <div className={styles.brandRow}>
            <div className={styles.logoBadge}>L5</div>
            <div className={styles.brandText}>
              <h1 id="login-title" className={styles.title}>
                Weekly Time Tracking
              </h1>
              <p className={styles.subtitle}>Sign in</p>
            </div>
          </div>

          <button
            className={styles.cta}
            onClick={startAuth}
            aria-label="Continue with ClickUp"
          >
            <span className={styles.ctaDot} aria-hidden="true" />
            Continue with ClickUp
          </button>

          <p className={styles.note}>
            You’ll be redirected to ClickUp to grant access.
          </p>
        </div>
      </div>
    </div>
  );
}
