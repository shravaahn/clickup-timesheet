// src/app/layout.tsx
import type { ReactNode } from 'react';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './globals.css';

export const metadata = {
  title: 'ClickUp Timesheet',
  description: 'Internal time tracking',
  // Put your logo file in /src/app/icon.png or /public/icon.png (512x512 recommended)
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
      </head>
      <body className="bg-surface text-foreground antialiased">
        <MantineProvider
          defaultColorScheme="dark"
          theme={{
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
            components: {
              Modal: {
                defaultProps: { radius: 'lg', shadow: 'xl', transitionProps: { transition: 'pop', duration: 180 } },
              },
              Button: { defaultProps: { radius: 'md' } },
            },
          }}
        >
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
