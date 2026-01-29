// src/app/dashboard/layout.tsx
import DashboardNavbar from "@/components/DashboardNavbar/DashboardNavbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <DashboardNavbar />
      <main style={{ flex: 1, padding: 24 }}>
        {children}
      </main>
    </div>
  );
}
