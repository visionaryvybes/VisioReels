import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @remotion/renderer server-side only — never bundle into client
  // renderer + bundler are Node-only — never ship to client
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
  ],

  // remotion core + player need transpiling for client/shared use
  transpilePackages: ["remotion", "@remotion/player"],

  // Silence Turbopack warning — Next.js 16 uses Turbopack by default
  // webpack config is only used for server-side rendering path
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
