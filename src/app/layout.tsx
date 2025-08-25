/*import type { Metadata } from "next";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css"; // <- your app-wide CSS (Tailwind + custom)

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="dark">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <MantineProvider defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
*/

import type { Metadata } from "next";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import ThemeSwitch from "@/components/ThemeSwitch";

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Pre-hydration theme sniffer to prevent flash
  const noFlash = `
    (function() {
      try {
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var t = stored || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  `;

  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <MantineProvider defaultColorScheme="dark">
          {children}
        </MantineProvider>

        {/* Floating theme switch (bottom-right) */}
        <ThemeSwitch />
      </body>
    </html>
  );
}
