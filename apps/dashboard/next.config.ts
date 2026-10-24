import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared contract ships as TypeScript source.
  transpilePackages: ["@agentfix/shared", "@agentfix/diagnosis"],
};

export default nextConfig;
