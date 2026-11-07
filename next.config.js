import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
};

export default withMDX(config);
