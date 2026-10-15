import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Admin image uploads: 8 MB per file, plus the multipart overhead.
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
