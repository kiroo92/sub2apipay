import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['wechatpay-node-v3'],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
