import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Fallback lets `prisma generate` run without a database (CI/Docker builds).
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/placeholder' },
});
