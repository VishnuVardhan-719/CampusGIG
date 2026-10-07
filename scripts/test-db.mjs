// Throwaway database runner for suites that write real rows.
//
// The integration suite used to write to the developer's demo database, and an
// interrupted run left stray "Integration fixture" accounts visible on the public
// rankings board. This script starts a stateless @prisma/dev PGlite instance on its own
// ports, migrates it, runs the requested command against it, then disposes of it. Nothing
// it creates can reach the database configured in .env.
//
//   node scripts/test-db.mjs -- vitest run tests/integration
import { spawn } from "node:child_process";
import { startPrismaDevServer } from "@prisma/dev";

if (process.env.NODE_ENV === "production") throw new Error("The throwaway test database must not run in production.");

const args = process.argv.slice(2);
const separator = args.indexOf("--");
if (separator === -1 || separator === args.length - 1) {
  throw new Error("Usage: node scripts/test-db.mjs -- <command> [args...]");
}
const command = args.slice(separator + 1);

const server = await startPrismaDevServer({
  name: "campusgig-test-db", persistenceMode: "stateless", debug: false,
  // Distinct from the 51213-51216 range used by `npm run db:local`.
  port: 51223, databasePort: 51224, shadowDatabasePort: 51225, streamsPort: 51226,
});

// schema=public is required by the Prisma CLI against the embedded PGlite server.
const databaseUrl = `${server.database.connectionString}${server.database.connectionString.includes("?") ? "&" : "?"}schema=public`;
const env = { ...process.env, DATABASE_URL: databaseUrl, SHADOW_DATABASE_URL: `${server.shadowDatabase.connectionString}${server.shadowDatabase.connectionString.includes("?") ? "&" : "?"}schema=public` };

function run(label, commandLine) {
  console.log(`\n[test-db] ${label}: ${commandLine}`);
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, { stdio: "inherit", env, shell: true });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let exitCode = 1;
try {
  console.log(`[test-db] throwaway database ready on ${new URL(databaseUrl).port} (persistence: none)`);
  exitCode = await run("migrate", "npx prisma migrate deploy");
  if (exitCode === 0) exitCode = await run("suite", command.join(" "));
} finally {
  await server.close();
}
process.exit(exitCode);
