// src/components/ThemeSwitch.tsx
"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function applyTheme(next: Scheme) {
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  window.dispatchEvent(new CustomEvent("app-theme-change", { detail: next }));
}

function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const fromLS = localStorage.getItem("theme");
  if (fromLS === "light" || fromLS === "dark") return fromLS;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Scheme>("light");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      aria-label="Toggle theme"
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-semibold
                 bg-[var(--panel)] border-[var(--border)] hover:brightness-95"
    >
      <span
        className="inline-block w-3.5 h-3.5 rounded-full"
        style={{ background: theme === "dark" ? "#60a5fa" : "#1f2937" }}
      />
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
