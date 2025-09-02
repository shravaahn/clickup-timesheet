"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved as Scheme;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Scheme>("light");

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle-fixed"
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      type="button"
    >
      <span className="dot" />
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
