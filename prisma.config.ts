import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the datasource connection URL out of schema.prisma and into the
 * config file. Migrations/introspection read the URL from here; the runtime
 * PrismaClient gets a pg driver adapter (see PrismaService).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
