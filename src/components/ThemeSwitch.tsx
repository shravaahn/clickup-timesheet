"use client";

import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function getInitial(): Scheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Scheme>(getInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);

    // Update meta theme-color for mobile bars
    const meta = document.querySelector(
      'meta[name="theme-color"]'
    ) as HTMLMetaElement | null;
    if (meta) meta.content = theme === "light" ? "#f6f7fb" : "#0b0f14";
  }, [theme]);

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 1000,
        border: "1px solid var(--border)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--panel), #fff 10%), var(--panel-elev))",
        color: "var(--text)",
        borderRadius: 999,
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        boxShadow:
          "0 4px 14px rgba(0,0,0,.1), inset 0 0 0 1px color-mix(in srgb, var(--border), transparent 60%)",
        cursor: "pointer",
        transition: "transform .12s ease, filter .12s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      title="Toggle dark / light"
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background:
            theme === "light"
              ? "radial-gradient(circle at 40% 40%, var(--accent) 40%, transparent 41%), #fff"
              : "linear-gradient(180deg,#0f1520,#0b0f14)",
          border: "1px solid var(--border)",
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
