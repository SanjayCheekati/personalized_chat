/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Use SWC-based minification (faster build, smaller output than Terser)
  swcMinify: true,

  // Aggressive caching for immutable static assets; no-store for API.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
