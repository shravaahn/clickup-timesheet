// src/components/ThemeSwitch.tsx
"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";
type Props = { corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left" };

function loadInitial(): Scheme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeSwitch({ corner = "top-right" }: Props) {
  const [theme, setTheme] = useState<Scheme>(loadInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = theme === "light" ? "#f6f7fb" : "#0b0f14";
  }, [theme]);

  const pos: Record<"top-right" | "top-left" | "bottom-right" | "bottom-left", React.CSSProperties> = {
    "top-right":    { top: 10,  right: 10 },
    "top-left":     { top: 10,  left: 10 },
    "bottom-right": { bottom: 10, right: 10 },
    "bottom-left":  { bottom: 10, left: 10 },
  };

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
      style={{
        position: "fixed",
        zIndex: 1000,
        ...pos[corner],
        height: 34,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 6px 16px rgba(0,0,0,.15)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: theme === "light" ? "var(--accent)" : "var(--l5-peach)",
          boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent), transparent 80%)",
        }}
      />
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
        {theme === "light" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
