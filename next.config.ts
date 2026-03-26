import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler for automatic memoization (Next.js 19+)
  reactCompiler: true,

  // Enable experimental performance optimizations
  experimental: {
    // Tree-shake unused code from these packages
    optimizePackageImports: ["axios", "cheerio", "zod", "daisyui"],

    // Optimize CSS output
    optimizeCss: true,
  },
};

export default nextConfig;
