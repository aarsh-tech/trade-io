import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@algo-trade/types"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
