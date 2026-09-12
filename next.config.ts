import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The org chart was withdrawn from public view; send old links to the team page.
      { source: "/org-chart", destination: "/team", permanent: false },
    ];
  },
};

export default nextConfig;
