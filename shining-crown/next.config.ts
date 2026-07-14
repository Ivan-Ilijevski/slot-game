import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module used by the SAS serial link; must stay external to the
  // server bundle.
  serverExternalPackages: ["serialport"],
};

export default nextConfig;
