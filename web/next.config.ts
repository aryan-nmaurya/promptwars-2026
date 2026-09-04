import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail the build on type errors instead of shipping them. Do not flip these
  // to `true` at 2am - fix the type.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
