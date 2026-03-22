/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), "playwright"];
    if (isServer) {
      config.externals.push("sql.js");
    }
    return config;
  },
};

export default nextConfig;
