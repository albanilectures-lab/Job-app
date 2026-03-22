/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), "playwright"];
    return config;
  },
};

export default nextConfig;
