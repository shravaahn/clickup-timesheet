"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

export default function LoginPage() {
  const [theme, setTheme] = useState<"dark"|"light">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("theme") as "dark"|"light") || "light";
  });
  useEffect(()=> { try { localStorage.setItem("theme", theme); } catch{} }, [theme]);

  return (
    <div className={styles.wrap} data-theme={theme}>
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              <img
                src="/company_logo.png"
                alt="Company"
                onError={(e)=>{ e.currentTarget.style.display="none"; }}
              />
            </div>
            <div>
              <h1 className={styles.h1}>Weekly Time Tracking</h1>
              <div className={styles.sub}>Sign in</div>
            </div>
          </div>

          <button
            className={styles.btn}
            onClick={() => { window.location.href = "/api/auth/login"; }}
          >
            Continue with ClickUp
          </button>

          <div className={styles.help}>You’ll be redirected to ClickUp to grant access.</div>

          <div className={styles.toggle}>
            <div
              className={`${styles.toggleBtn} ${theme === "light" ? styles.on : ""}`}
              role="switch"
              aria-checked={theme === "light"}
              onClick={()=> setTheme(t => t === "light" ? "dark" : "light")}
            >
              <div className={styles.toggleKnob}/>
            </div>
            <span className={styles.label}>{theme === "light" ? "Light" : "Dark"}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
