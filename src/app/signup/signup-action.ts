"use server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
const schema=z.object({name:z.string().trim().min(2).max(80),email:z.email().max(254),password:z.string().min(10).max(72),role:z.enum(["STUDENT","CLIENT"])});
export async function signupAction(formData: FormData) {
  const input=schema.safeParse(Object.fromEntries(formData));
  if(!input.success) redirect("/signup?error="+encodeURIComponent("Check your name, email and password (10–72 characters)."));
  let failed=false;
  try {
    await db.user.create({data:{name:input.data.name,email:input.data.email.trim().toLowerCase(),passwordHash:await hash(input.data.password,12),role:input.data.role,...(input.data.role==="STUDENT"?{studentProfile:{create:{college:"",degree:"",year:1,bio:"",city:"",weeklyHours:10,workMode:"REMOTE"}}}:{clientProfile:{create:{organizationName:input.data.name,organizationType:"STUDENT_FOUNDER",description:"",city:""}}})}});
  } catch { failed=true; }
  if(failed) redirect("/signup?error="+encodeURIComponent("Account could not be created. Check your details or try signing in."));
  redirect("/login?success=Account+created");
}