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
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: 64,
        height: 32,
        padding: "2px",
        borderRadius: 24,
        border: "2px solid var(--border, rgba(0,0,0,0.1))",
        background: theme === "dark" 
          ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" 
          : "linear-gradient(135deg, #87ceeb 0%, #4a90e2 100%)",
        cursor: "pointer",
        transition: "background 0.4s ease, border-color 0.3s ease",
        boxShadow: theme === "dark"
          ? "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.05)"
          : "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.4)",
      }}
    >
      {/* Sliding toggle indicator */}
      <span
        style={{
          position: "absolute",
          left: theme === "dark" ? "calc(100% - 30px)" : "2px",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: theme === "dark"
            ? "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)"
            : "linear-gradient(135deg, #fff 0%, #f8f9fa 100%)",
          boxShadow: theme === "dark"
            ? "0 2px 6px rgba(0,0,0,0.4)"
            : "0 2px 6px rgba(0,0,0,0.2)",
          transition: "left 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
      
      {/* Icons */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontSize: 16,
          marginLeft: 6,
          opacity: theme === "light" ? 1 : 0.6,
          transform: theme === "light" ? "scale(1) rotate(0deg)" : "scale(0.85) rotate(-30deg)",
          transition: "opacity 0.3s ease, transform 0.4s ease",
          filter: theme === "light" ? "drop-shadow(0 0 2px rgba(255,255,255,0.8))" : "none",
        }}
      >
        ☀️
      </span>
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontSize: 16,
          marginRight: 6,
          opacity: theme === "dark" ? 1 : 0.6,
          transform: theme === "dark" ? "scale(1) rotate(0deg)" : "scale(0.85) rotate(30deg)",
          transition: "opacity 0.3s ease, transform 0.4s ease",
          filter: theme === "dark" ? "drop-shadow(0 0 2px rgba(255,255,255,0.6))" : "none",
        }}
      >
        🌙
      </span>
    </button>
  );
}