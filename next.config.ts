import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack warning — Next.js 16 uses Turbopack by default
  turbopack: {},

  // Suppress preload resource warnings in dev
  reactStrictMode: false,

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        child_process: false,
        worker_threads: false,
      };
    }
    return config;
  },
};

export default nextConfig;
