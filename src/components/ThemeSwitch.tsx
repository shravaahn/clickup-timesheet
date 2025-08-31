"use client";

import { useEffect, useMemo, useState } from "react";

type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

type Props = {
  /** Where to pin the toggle. Defaults to "top-right". */
  corner?: Corner;
  /** Optional: extra z-index if something overlaps it. */
  zIndex?: number;
};

type Scheme = "light" | "dark";

function initialTheme(): Scheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function ThemeSwitch({ corner = "top-right", zIndex = 60 }: Props) {
  const [theme, setTheme] = useState<Scheme>(initialTheme);

  // -- fix the TS error by using a non-optional discriminated union key
  const anchor: React.CSSProperties = useMemo(() => {
    const map: Record<Corner, React.CSSProperties> = {
      "top-right":    { top: 12,  right: 12 },
      "top-left":     { top: 12,  left: 12 },
      "bottom-right": { bottom: 12, right: 12 },
      "bottom-left":  { bottom: 12, left: 12 },
    } as const;
    return map[corner]; // corner is guaranteed (has default), no union-with-undefined
  }, [corner]);

  useEffect(() => {
    // reflect theme on <html data-theme="">
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);

    // update <meta name="theme-color"> for mobile chrome, etc.
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = theme === "light" ? "#f6f7fb" : "#0b0f14";
  }, [theme]);

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      style={{
        position: "fixed",
        ...anchor,
        zIndex,
        height: 34,
        minWidth: 34,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 8px 22px rgba(0,0,0,.12)",
        cursor: "pointer",
        transition: "transform .12s ease, filter .12s ease, background .2s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: theme === "light" ? "var(--l5-yellow, #ffcf37)" : "var(--l5-blue, #298ee8)",
          border: "1px solid var(--border)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.06)",
          transition: "all .2s ease",
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 700, opacity: .8 }}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
