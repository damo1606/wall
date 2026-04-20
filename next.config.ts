import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/se%C3%B1ales', destination: '/senales', permanent: true },
      { source: '/valoraci%C3%B3n', destination: '/valoracion', permanent: true },
    ]
  },
};

export default nextConfig;
