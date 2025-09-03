"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function getInitial(): Scheme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Scheme>("light");

  useEffect(() => {
    const t = getInitial();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      aria-label="Toggle color scheme"
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
    >
      <span className="dot" />
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
