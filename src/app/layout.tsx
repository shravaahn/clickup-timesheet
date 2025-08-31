import type { Metadata } from "next";
import "./globals.css"; // keep your global if you have it (or remove if unused)
//import ThemeSwitch from "@/components/ThemeSwitch";
import '@/styles/theme.css';

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
  // Helps mobile address bar color match theme (we’ll update this dynamically too)
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta name="theme-color" content="#0b0f14" />
      </head>
      <body>
        {/* Your app */}
        {children}

        {/* Floating theme toggle */}
        {/* <ThemeSwitch /> */}
      </body>
    </html>
  );
}
