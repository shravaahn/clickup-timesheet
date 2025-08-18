// src/app/AppView/page.tsx
// This route is not used anymore. Redirect to the main dashboard.
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard");
}
