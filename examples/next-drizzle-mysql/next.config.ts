import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@cipherstash/stack', 'mysql2'],
}

export default nextConfig
