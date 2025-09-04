// src/app/login/page.tsx
"use client";

import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div
        className="
          w-full max-w-[380px]
          rounded-xl border border-[var(--border)]
          bg-[var(--panel)] p-6 shadow-sm
        "
      >
        <h1 className="text-lg font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Continue to Time Tracking
        </p>

        <form className="mt-5 grid gap-3" action="/api/login" method="post">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[var(--text)] outline-none"
              placeholder="you@company.com"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">Password</span>
            <input
              name="password"
              type="password"
              required
              className="rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[var(--text)] outline-none"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            className="
              mt-2 h-10 rounded-lg
              bg-[var(--accent)] text-white font-semibold
              hover:brightness-110 transition
            "
          >
            Sign in
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
          <Link href="#" className="hover:underline">
            Forgot password?
          </Link>
          <Link href="/" className="hover:underline">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
