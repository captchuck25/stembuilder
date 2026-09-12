import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile pictures are the ONLY remote images we render, and we
    // render them through /_next/image (see lib/avatar.ts) so the student's
    // browser talks to our origin, not Google's. Do not add analytics/CDN hosts.
    remotePatterns: [{ protocol: "https", hostname: "*.googleusercontent.com" }],
  },
};

export default nextConfig;
