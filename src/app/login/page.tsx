"use client";

import { useEffect, useState } from "react";
import styles from "./Login.module.css";

export default function LoginPage() {
  const [redirecting, setRedirecting] = useState(false);

  // If already signed in, go to dashboard
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.user?.id) window.location.href = "/dashboard";
        }
      } catch {}
    })();
  }, []);

  const login = () => {
    setRedirecting(true);
    window.location.href = "/api/auth/clickup-login";
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brandRow}>
          <div className={styles.badge}>TT</div>
          <div className={styles.brandText}>
            <div className={styles.appTitle}>Weekly Time Tracking</div>
            <div className={styles.appSub}>Sign in</div>
          </div>
        </div>

        <button className={styles.primaryBtn} onClick={login} disabled={redirecting}>
          {redirecting ? "Redirecting to ClickUp…" : "Continue with ClickUp"}
        </button>

        <p className={styles.hint}>
          You’ll be redirected to ClickUp to grant access.
        </p>
      </section>
    </main>
  );
}
