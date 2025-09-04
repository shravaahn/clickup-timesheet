// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";

/** Inline component so you don't need another file. */
function ThemeToggle() {
  // hydrate-safe toggle (avoids mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // manual, SSR-safe read/write (works even if next-themes is not used elsewhere)
  const get = () =>
    (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme")) || "light";

  const set = (v: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", v);
    try {
      window.localStorage.setItem("theme", v);
    } catch {}
  };

  const isDark = get() === "dark";
  return (
    <button
      aria-label="Toggle color scheme"
      onClick={() => set(isDark ? "light" : "dark")}
      className="
        fixed top-3 right-4 z-[1000]
        rounded-full border border-[var(--border)]
        px-3 py-1.5 text-xs font-semibold
        bg-[var(--panel)] text-[var(--text)]
        hover:brightness-110 transition
        shadow-sm
      "
    >
      {isDark ? "Dark" : "Light"}
    </button>
  );
}

export const metadata: Metadata = {
  title: "Time Tracking",
  description: "ClickUp Timesheet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // read initial theme from LS or prefers-color-scheme and put on <html>
  // (one-time inline to avoid flash)
  const themeAttr =
    '(function(){try{var ls=localStorage.getItem("theme");if(ls){document.documentElement.setAttribute("data-theme",ls);return}var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",m?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();';

  return (
    <html lang="en" suppressHydrationWarning>
      {/* put the attribute on <html>, which your CSS already uses */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeAttr }} />
        <meta name="theme-color" content="#0b0f14" />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        {/* No AppShell / frame wrapper, just the page */}
        <ThemeProvider attribute="data-theme" defaultTheme="light">
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
