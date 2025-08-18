// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 🚀 Skip ESLint in CI builds so deploy doesn't block on style rules
  eslint: { ignoreDuringBuilds: true },

  // Keep type-checking on (safer). If you *still* want to bypass type errors:
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
