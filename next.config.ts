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
      // Short links to the catalog tables.
      ...["terms", "examples", "llm-models", "llm-providers", "signup-domains", "whitelisted-emails"].map((slug) => ({ source: `/${slug}`, destination: `/catalog/${slug}`, permanent: false })),
      { source: "/catalog", destination: "/prompt-chains", permanent: false },
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
