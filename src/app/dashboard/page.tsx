// src/app/dashboard/page.tsx

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Dashboard Shell
 * 
 * This is the new entry point for /dashboard.
 * It simply redirects to /dashboard/timesheets (default view).
 * 
 * All heavy logic has been moved to child routes.
 */
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to timesheets as the default view
    router.replace("/dashboard/timesheets");
  }, [router]);

  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      minHeight: "100vh",
      color: "var(--muted)" 
    }}>
      Redirecting to timesheets...
    </div>
  );
}