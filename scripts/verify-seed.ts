import "dotenv/config";
import { db } from "../src/lib/db";
const users=await db.user.groupBy({by:["role"],where:{isDemo:true},_count:true});
const tasks=await db.task.count({where:{isDemo:true}});
const contracts=await db.contract.count({where:{isDemo:true}});
const evidence=await db.skillEvidence.count({where:{isDemo:true}});
if(users.find(u=>u.role==="STUDENT")?._count!==10||users.find(u=>u.role==="CLIENT")?._count!==6||users.find(u=>u.role==="ADMIN")?._count!==1||tasks!==20)throw new Error("Seed row count mismatch");
console.log({users,tasks,contracts,evidence});
await db.$disconnect();