import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: [
    '@tradies/site-spec',
    '@tradies/templates',
    '@tradies/db',
    '@tradies/llm',
    '@tradies/fixtures',
    '@tradies/compliance',
    '@tradies/engine',
  ],
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default config
