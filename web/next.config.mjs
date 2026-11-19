// Static export: `npm run build` writes plain HTML/JS/CSS to web/out, served by GitHub Pages.
// NEXT_PUBLIC_BASE_PATH is set by the Pages workflow (the site lives under /<repo-name>).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
export default {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
