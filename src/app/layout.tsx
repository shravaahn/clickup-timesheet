"use client";

import "./globals.css";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";

function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (theme === "system" ? systemTheme : theme) || "light";
  const isDark = current === "dark";

  return (
    <button
      aria-label="Toggle theme"
      className="globalSwitch"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="knob" data-on={String(isDark)} />
      <span className="label">{mounted ? (isDark ? "Dark" : "Light") : "…"}</span>
    </button>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Global provider adds html[data-theme] automatically */}
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          

          {/* Page content */}
          <main className="pageContainer">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
