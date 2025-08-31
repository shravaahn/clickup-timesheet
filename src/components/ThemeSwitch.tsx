"use client";

import { useEffect, useMemo, useState } from "react";

type Scheme = "light" | "dark";
type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

function getInitial(): Scheme {
  if (typeof window === "undefined") return "light";
  const s = window.localStorage.getItem("theme");
  if (s === "light" || s === "dark") return s;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeSwitch({ corner = "top-right" }: { corner?: Corner }) {
  const [theme, setTheme] = useState<Scheme>(getInitial);

  // visually place the switch
  const posStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = { position: "fixed", zIndex: 9999 };
    if (corner === "top-right") Object.assign(base, { top: 12, right: 12 });
    else if (corner === "top-left") Object.assign(base, { top: 12, left: 12 });
    else if (corner === "bottom-right") Object.assign(base, { bottom: 12, right: 12 });
    else Object.assign(base, { bottom: 12, left: 12 });
    return base;
  }, [corner]);

  useEffect(() => {
    // set on <html> for all pages
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);

    // handy for pages/components that need to react (dashboard page below)
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: theme }));

    // address-bar color (mobile)
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = theme === "light" ? "#ffffff" : "#0b0f14";
  }, [theme]);

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
      style={{
        ...posStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid var(--border, rgba(0,0,0,.15))",
        background: "var(--panel-2, #fff)",
        color: "var(--text, #111)",
        boxShadow: "0 6px 18px rgba(0,0,0,.12)",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          display: "inline-block",
          background:
            theme === "light"
              ? "radial-gradient(circle at 30% 30%, #ffcf37, #ffd861)"
              : "radial-gradient(circle at 30% 30%, #ff5758, #d60000)",
          border: "1px solid var(--border, rgba(0,0,0,.15))",
        }}
      />
      {theme === "light" ? "Light" : "Dark"}
    </button>
  );
}
