import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The Prisma CLI needs an explicit schema against the embedded @prisma/dev PGlite
    // server, otherwise it cannot read its own _prisma_migrations history table.
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable&schema=public",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:51215/template1?sslmode=disable&schema=public",
  },
});