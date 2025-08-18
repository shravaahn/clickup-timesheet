import type { Metadata } from "next";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

export const metadata: Metadata = {
  title: "ClickUp Timesheet",
  description: "Internal timesheet dashboard for ClickUp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="dark">
      <head>
        {/* Keeps Mantine’s color scheme in sync during hydration */}
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
