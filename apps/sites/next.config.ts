import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: [
    '@tradies/config',
    '@tradies/site-spec',
    '@tradies/templates',
    '@tradies/db',
    '@tradies/llm',
    '@tradies/fixtures',
    '@tradies/compliance',
  ],
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default config
