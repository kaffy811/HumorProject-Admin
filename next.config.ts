import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Media uploads go through a Server Action; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The posts manager used to live at /media.
  async redirects() {
    return [
      { source: "/media", destination: "/posts", permanent: false },
      { source: "/media/:path*", destination: "/posts/:path*", permanent: false },
      // Briefly separate pages: the mix now lives on Prompt chains, AI media in Posts.
      { source: "/ai/prompt-chains/mix", destination: "/ai/prompt-chains#mix", permanent: false },
      { source: "/ai/media", destination: "/posts?source=ai", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
};
export default nextConfig;
