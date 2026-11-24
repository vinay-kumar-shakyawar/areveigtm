import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard is fully request-dependent (session + tenant data), so the
  // classic dynamic rendering model is simpler and safer than Cache Components.
  cacheComponents: false,
  output: "standalone",
  serverExternalPackages: [
    "@node-rs/argon2",
    "pino",
    "pino-pretty",
    "pg-boss",
    "embedded-postgres",
    "imapflow",
    "nodemailer",
    "@prisma/client",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
