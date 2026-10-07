import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { analyzeTask } from "@/lib/ai";
const requestSchema=z.object({text:z.string().trim().min(20).max(10000)});
export async function POST(request:Request){
  const user=await currentUser();
  if(!user||user.role!=="CLIENT")return NextResponse.json({error:"Client access required"},{status:403});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const input=requestSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:"Describe your task in 20–10,000 characters."},{status:400});
  try{return NextResponse.json({data:await analyzeTask(input.data.text)});}catch{return NextResponse.json({error:"Analysis unavailable; you can still create the task manually."},{status:503});}
}