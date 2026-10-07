import { startPrismaDevServer } from "@prisma/dev";
import { writeFile,mkdir } from "node:fs/promises";
if(process.env.NODE_ENV==="production")throw new Error("Local development database must not run in production.");
const server=await startPrismaDevServer({name:"campusgig",persistenceMode:"stateful",port:51213,databasePort:51214,shadowDatabasePort:51215,streamsPort:51216,databaseIdleTimeoutMillis:120000,shadowDatabaseIdleTimeoutMillis:120000});
await mkdir(".local",{recursive:true});
await writeFile(".local/database.json",JSON.stringify({database:server.database,shadowDatabase:server.shadowDatabase},null,2));
console.log("CampusGig local PostgreSQL ready on 51214. Connection details: .local/database.json");
let closing=false;
async function close(){if(closing)return;closing=true;await server.close();process.exit(0);}
process.on("SIGINT",close);process.on("SIGTERM",close);