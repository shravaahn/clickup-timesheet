"use client";

import { useEffect, useState } from "react";

export default function ThemeSwitch() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Read current theme on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    const systemPrefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const initial = stored ?? (systemPrefersDark ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // Avoid hydration mismatch
  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.14)",
        background:
          theme === "dark"
            ? "linear-gradient(180deg,#1a2231,#0f1623)"
            : "linear-gradient(180deg,#ffffff,#f5f7fb)",
        color: theme === "dark" ? "#e6edf3" : "#0c1220",
        boxShadow:
          theme === "dark"
            ? "0 8px 24px rgba(0,0,0,.35)"
            : "0 10px 30px rgba(255,0,0,.08)",
        cursor: "pointer",
        transition: "transform .2s ease, filter .2s ease",
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(.98)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background:
            theme === "dark"
              ? "radial-gradient(circle at 35% 35%, #ffd166 0 55%, transparent 56%), #0f1623"
              : "conic-gradient(from 0deg, #ff2d2d, #ff7a7a 30%, #fff 30% 100%)",
          border:
            theme === "dark"
              ? "1px solid rgba(255,255,255,.18)"
              : "1px solid rgba(0,0,0,.08)",
        }}
      >
        {theme === "dark" ? "🌙" : "☀️"}
      </span>
      <span style={{ fontWeight: 700, fontSize: 12 }}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
