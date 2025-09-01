import "./globals.css"; // keep your global styles if you have them
import ThemeToggle from "@/components/ThemeToggle";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Timesheet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Global top bar with theme button (right aligned) */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            display: "flex",
            justifyContent: "flex-end",
            padding: "10px 14px",
            background: "transparent",
          }}
        >
          <ThemeToggle />
        </header>

        {/* Page content */}
        {children}
      </body>
    </html>
  );
}
