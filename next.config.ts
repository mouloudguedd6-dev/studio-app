import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next proxy/middleware buffers request bodies up to 10MB by default.
    // Large multipart uploads must keep the complete body available to the route handler.
    proxyClientMaxBodySize: '600mb',
    // Allow large file uploads through API routes
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
  // Increase limit for API route body parsing
  serverExternalPackages: [],
};

export default nextConfig;
