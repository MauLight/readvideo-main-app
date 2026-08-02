import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron loads the built app as plain files; there's no Next server to
  // render or optimize anything at runtime.
  output: "export",
  images: {
    // The default loader proxies remote images through the server, which a
    // static export doesn't have. Thumbnails load straight from i.ytimg.com,
    // so remotePatterns (an allowlist for that proxy) no longer applies.
    unoptimized: true,
  },
};

export default nextConfig;
