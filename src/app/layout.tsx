// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import ThemeToggle from "../components/ThemeToggle";

export const metadata: Metadata = {
  title: "Time Tracking",
  description: "ClickUp Timesheet",
  // Helps mobile address bar color match theme
  other: { "theme-color": "#f6f7fb" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server component is fine; ThemeToggle is a small client island
  return (
    <html lang="en" data-theme="light">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background:
            "radial-gradient(900px 480px at 50% -8%, #f6f7fb 0%, #eef1f6 60%, #e9edf5 100%)",
          color: "#293237",
          // keep room below any floating dev widgets
          paddingBottom: 48,
        }}
      >
        {/* Global top bar (visible everywhere: login, dashboard, etc.) */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "saturate(120%) blur(8px)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              maxWidth: 1440,
              margin: "0 auto",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    background:
                      "linear-gradient(180deg, #ff8189 0%, #d60000 100%)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                  aria-label="Logo"
                >
                  TT
                </div>
                <strong style={{ fontWeight: 700 }}>Time Tracking</strong>
              </Link>
            </div>

            {/* Single global theme toggle */}
            <ThemeToggle />
          </div>
        </header>

        {/* Page shell */}
        <main style={{ maxWidth: 1440, margin: "12px auto 24px", padding: "0 16px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
