import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Deep links must be served by the dashboard on reload or direct open.
  async rewrites() {
    return [{ source: "/module/:slug", destination: "/" }];
  },
};
export default nextConfig;
