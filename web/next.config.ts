import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the bridge device can serve the whole app itself (same-origin).
  // Every page is a client component, so this builds to plain static files in `out/`.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
