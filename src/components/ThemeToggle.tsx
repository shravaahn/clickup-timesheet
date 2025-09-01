"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function getInitialTheme(): Scheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Scheme>("light");

  // initialize once
  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  // apply to <html>, persist, and notify all pages
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f6f7fb" : "#0b0f14";
    window.localStorage.setItem("theme", theme);
    // tell any page components to update their own containers
    window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.15)",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "saturate(120%) blur(6px)",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          display: "inline-block",
          background:
            theme === "dark"
              ? "radial-gradient(circle at 30% 30%, #ff5758, #d60000)"
              : "radial-gradient(circle at 30% 30%, #ffd166, #ffaf00)",
        }}
      />
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
