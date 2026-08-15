import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["111.111.111.100"],
  // Standalone output for the Docker image (minimal Node server, no node_modules).
  output: "standalone",
  // Polling for Docker bind mounts (macOS has no inotify). Only in the dev
  // container; local dev keeps native file watching.
  watchOptions: process.env.DOCKER_DEV ? { pollIntervalMs: 300 } : undefined,
};

export default nextConfig;
