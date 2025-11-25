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
        width: 60,
        height: 32,
        padding: "4px 6px",
        borderRadius: 24,
        border: "none",
        background: "var(--panel)",
        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
        cursor: "pointer",
        transition: "background 0.3s ease",
      }}
    >
      <span
        style={{
          fontSize: 18,
          opacity: theme === "light" ? 1 : 0.4,
          transform: theme === "light" ? "scale(1)" : "scale(0.8)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        ☀️
      </span>
      <span
        style={{
          fontSize: 18,
          opacity: theme === "dark" ? 1 : 0.4,
          transform: theme === "dark" ? "scale(1)" : "scale(0.8)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        🌙
      </span>
    </button>
  );
}