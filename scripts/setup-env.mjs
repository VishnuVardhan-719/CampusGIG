import {readFile,writeFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
if(existsSync(".env"))throw new Error(".env already exists; won't overwrite credentials.");
const d=JSON.parse(await readFile(".local/database.json","utf8"));
const env={DATABASE_URL:d.database.connectionString,SHADOW_DATABASE_URL:d.shadowDatabase.connectionString,NEXTAUTH_URL:"http://localhost:3000",NEXTAUTH_SECRET:randomBytes(32).toString("hex"),AI_BASE_URL:"",AI_API_KEY:"",AI_MODEL:"",DEMO_MODE:"true",ALLOW_DEMO_RESET:"false",UPLOAD_DIR:"./uploads"};
await writeFile(".env",Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join("\n")+"\n",{flag:"wx"});
console.log("Local .env created. Secrets not printed.");