import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: process.env.AUTODIDACT_BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  serverExternalPackages: ['esbuild'],
};

export default withMDX(config);
