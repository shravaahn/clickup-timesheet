"use client";

import ThemeToggle from "@/components/ThemeToggle";

export default function GlobalTopBar() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        width: "100%",
        backdropFilter: "saturate(120%) blur(8px)",
        WebkitBackdropFilter: "saturate(120%) blur(8px)",
        borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
        background:
          "color-mix(in srgb, var(--page-bg, #ffffff) 82%, transparent)",
      }}
      aria-label="Global top bar"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 48,
          padding: "0 16px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            opacity: 0.72,
            letterSpacing: 0.2,
          }}
        >
          ClickUp Timesheet
        </div>

        <div style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
