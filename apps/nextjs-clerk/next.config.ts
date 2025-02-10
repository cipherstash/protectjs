import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cipherstash.com',
      },
    ],
  },
  // serverExternalPackages does not work with workspace packages
  // https://github.com/vercel/next.js/issues/43433
  // ---
  // TODO: Once this is fixed upstream, we can use the workspace packages
  serverExternalPackages: ['@cipherstash/protect'],
}

export default nextConfig
