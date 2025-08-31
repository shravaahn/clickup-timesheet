/*"use client";

import { useEffect, useState } from "react";

type Scheme = "dark" | "light";

function getInitial(): Scheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  // System preference (fallback)
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Scheme>(getInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);

    // Optional: set browser address-bar color (mobile), and background
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = theme === "light" ? "#f6f7fb" : "#0b0f14";

    // Nice body bg to avoid flash on toggle
    document.body.style.background = theme === "light"
      ? "linear-gradient(180deg,#f6f7fb,#eef1f6 60%)"
      : "linear-gradient(180deg,#0f1115,#0b0d12 60%)";
  }, [theme]);

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 80,
        height: 44,
        minWidth: 44,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background:
          "linear-gradient(135deg, var(--btnGradA) 0%, var(--btnGradB) 100%)",
        color: "var(--btnText)",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 10px 24px rgba(0,0,0,.25)",
        cursor: "pointer",
        transition: "transform .15s ease, filter .15s ease",
      }}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(.98)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      title="Toggle dark / light"
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: "var(--toggleIconBg)",
          border: "1px solid var(--border)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.06)",
          transition: "background .2s ease",
        }}
      >
        {/* simple sun/moon glyph that cross-fades *///}
       /* <span
          aria-hidden
          style={{
            position: "relative",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: theme === "light" ? "var(--accent)" : "transparent",
            boxShadow: theme === "light"
              ? "0 0 0 3px color-mix(in srgb, var(--accent), #fff 60%)"
              : "none",
            transition: "all .2s ease",
          }}
        />
      </span>
      <span style={{ fontWeight: 700, letterSpacing: .2 }}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
*/