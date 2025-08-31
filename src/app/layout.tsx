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
  // Inline boot script prevents theme flash before hydration
  const bootTheme = `
    try {
      var t = localStorage.getItem("theme");
      if (!t) {
        t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      }
      document.documentElement.setAttribute("data-theme", t);
    } catch (e) {}
  `;

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0b0f14" />
        <script dangerouslySetInnerHTML={{ __html: bootTheme }} />
      </head>
      <body>
        {children}
        {/* Global corner toggle (top-right by default) */}
        <ThemeSwitch corner="top-right" />
      </body>
    </html>
  );
}
