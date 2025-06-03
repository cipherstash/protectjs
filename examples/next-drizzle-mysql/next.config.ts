import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@cipherstash/protect', 'mysql2'],
}

export default nextConfig
