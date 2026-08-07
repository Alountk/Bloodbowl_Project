import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["111.111.111.100"],
  // Standalone output for the Docker image (minimal Node server, no node_modules).
  output: "standalone",
};

export default nextConfig;
