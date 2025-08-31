// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import "@/styles/theme.css";
import ThemeSwitch from "@/components/ThemeSwitch";

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Inline script to set initial theme BEFORE React hydration (avoids flash)
  const noFlash = `
  (function(){
    try {
      var stored = localStorage.getItem('theme');
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      var t = stored === 'light' || stored === 'dark' ? stored : (prefersLight ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', t);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'light' ? '#f6f7fb' : '#0b0f14');
    } catch (e) {}
  })();`;

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0b0f14" />
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        {children}
        {/* Global floating theme switch */}
        <ThemeSwitch />
      </body>
    </html>
  );
}
