// src/lib/clickupAuth.ts
// Builds the correct Authorization header value for ClickUp.
//
// - Personal API tokens start with "pk_" and must be used as-is (NO "Bearer ").
// - OAuth tokens should be sent as "Bearer <token>".
export function makeAuthHeader(rawToken: string): string {
  const t = String(rawToken || "").trim();
  if (!t) throw new Error("ClickUp token missing");

  if (t.startsWith("pk_")) return t;          // Personal token (no Bearer)
  if (t.startsWith("Bearer ")) return t;      // Already formatted OAuth token
  return `Bearer ${t}`;                       // Plain OAuth access token
}
