import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared contract ships as TypeScript source.
  transpilePackages: ["@agentfix/shared", "@agentfix/diagnosis"],
  // The online (read-only) copy reads its recorded results from demo-data/.
  outputFileTracingIncludes: { "/**": ["./demo-data/**/*"] },
};

export default nextConfig;
