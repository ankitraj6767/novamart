import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@novamart/api-client', '@novamart/ui'],
  images: { remotePatterns: [{ protocol: 'http', hostname: '127.0.0.1' }, { protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
