import type { NextConfig } from "next";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

const config: NextConfig = {
  transpilePackages: ["@hub/shared"],
  // ให้เบราว์เซอร์เรียก API ผ่าน origin เดียวกับเว็บ cookie จะได้เป็น first-party
  rewrites: async () => [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }],
};

export default config;
