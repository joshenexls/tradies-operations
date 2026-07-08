import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  // db:migrate against Supabase uses the SESSION-mode connection string
  // (port 5432) — the transaction pooler (6543) breaks migrations.
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
})
