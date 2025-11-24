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
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      <span style={{ fontSize: 14 }}>{theme === "dark" ? "🌙" : "☀️"}</span>
      <span style={{ display: "none" }}>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}