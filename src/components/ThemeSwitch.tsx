// src/components/ThemeSwitch.tsx
"use client";

import React, { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored as Scheme;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeSwitch({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Scheme>(() => getInitialTheme());

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage.setItem("theme", theme);
      window.dispatchEvent(new CustomEvent("app-theme-change", { detail: theme }));
    } catch {
      // ignore (SSR or restricted env)
    }
  }, [theme]);

  useEffect(() => {
    const onStorage = () => setTheme(getInitialTheme());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as Scheme | undefined;
      if (detail === "light" || detail === "dark") setTheme(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("app-theme-change", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-theme-change", onCustom as EventListener);
    };
  }, []);

  function toggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return (
    <button
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={toggle}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: 28,
        height: 28,
        padding: 80,
        borderRadius: 20,
        border: "2px solid var(--border)",
        background: "var(--panel)",
        cursor: "pointer",
        transition: "background 0.4s ease",
      }}
    >
      <span style={{ fontSize: 14, marginLeft: theme === "light" ? 2 : 0 }}>☀️</span>
      <span style={{ fontSize: 14, marginRight: theme === "dark" ? 2 : 0 }}>🌙</span>
    </button>
  );
}