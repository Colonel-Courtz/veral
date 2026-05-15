import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@veral/authority',
    '@veral/core',
    '@veral/score',
    '@veral/shared',
    '@veral/sources',
  ],
  typedRoutes: true,
};

export default config;
