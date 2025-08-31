import type { Metadata } from "next";
import "@/styles/theme.css";
import "./globals.css";
import ThemeSwitch from "@/components/ThemeSwitch";

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta name="theme-color" content="#0b0f14" />
      </head>
      <body>
        {children}
        {/* Global, aesthetic corner toggle — move corner if you prefer */}
        <ThemeSwitch corner="top-right" />
      </body>
    </html>
  );
}
