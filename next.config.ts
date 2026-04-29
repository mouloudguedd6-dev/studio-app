import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large file uploads through API routes
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
  // Increase limit for API route body parsing
  serverExternalPackages: [],
};

export default nextConfig;
