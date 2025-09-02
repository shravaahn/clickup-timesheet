//src/app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

export default function LoginPage() {
  // reflect the global theme set on <html>
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const htmlTheme =
      (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
    setTheme(htmlTheme);
    const onChange = (e: Event) => {
      const t = (e as CustomEvent).detail as "light" | "dark";
      setTheme(t);
    };
    window.addEventListener("app-theme-change", onChange as any);
    return () => window.removeEventListener("app-theme-change", onChange as any);
  }, []);

  // ✅ correct OAuth start route (your file is /api/auth/clickup-login)
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

          <p className={styles.note}>You’ll be redirected to ClickUp to grant access.</p>
        </div>
      </div>
    </div>
  );
}
