import path from 'node:path'
import type { NextConfig } from 'next'

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['@lab2/contract'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }]
  },
}

export default nextConfig
