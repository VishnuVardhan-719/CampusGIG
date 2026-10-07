import "dotenv/config";
import pg from "pg";
const url=new URL(process.env.DATABASE_URL??"");
if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw new Error("This bootstrap is only for local development PostgreSQL.");
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
await client.connect();
// Prisma's documented PGlite first-migration workaround (issue #29366).
await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`);
await client.end();
console.log("Local Prisma migration metadata table ready.");