/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), "playwright", "playwright-extra", "puppeteer-extra-plugin-stealth", "puppeteer-extra-plugin", "clone-deep", "merge-deep", "canvas", "tesseract.js", "pdfjs-dist", "pdfjs-dist/legacy/build/pdf.js"];
    return config;
  },
};

export default nextConfig;
