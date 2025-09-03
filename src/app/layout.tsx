// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Time Tracking",
  description: "Internal timesheet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* critical no-flash theme init */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try{
    var t = localStorage.getItem('theme');
    if(!t){
      t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
})();`,
          }}
        />
      </head>
      <body>
        {children}
        {/* Global floating toggle (top-right) */}
        <ThemeToggle />
      </body>
    </html>
  );
}
