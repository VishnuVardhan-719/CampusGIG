"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as service from "@/server/services";

const str=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const num=(f:FormData,k:string)=>Number(str(f,k));
function paise(f:FormData,k:string){const n=num(f,k);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>1e-6)throw new Error("Enter a valid amount with up to two decimal places.");return Math.round(n*100);}
async function run(path:string,fn:()=>Promise<unknown>){
  let error:string|undefined;
  try {await fn();} catch(e){error=e instanceof Error?e.message:"Action failed. Please try again.";console.error("Mutation failed",e);}
  revalidatePath("/", "layout");
  redirect(`${path}?${error?"error="+encodeURIComponent(error):"success=Saved"}`);
}
export async function createTaskAction(f:FormData){const u=await requireUser();await run("/dashboard",()=>service.createTask(u.id,{title:str(f,"title"),description:str(f,"description"),category:str(f,"category"),difficulty:str(f,"difficulty"),budgetMin:paise(f,"budgetMin"),budgetMax:paise(f,"budgetMax"),deadline:new Date(str(f,"deadline")),estimatedHours:num(f,"estimatedHours"),workMode:str(f,"workMode"),location:str(f,"location"),skillIds:f.getAll("skillIds").map(String),aiSummary:str(f,"aiSummary")}));}
export async function applyAction(f:FormData){const u=await requireUser();await run(`/tasks/${str(f,"taskId")}`,()=>service.applyToTask(u.id,{taskId:str(f,"taskId"),proposal:str(f,"proposal"),estimatedHours:num(f,"estimatedHours"),proposedPrice:paise(f,"proposedPrice")}));}
export async function hireAction(f:FormData){const u=await requireUser();await run("/contracts",()=>service.hireApplicant(u.id,str(f,"applicationId")));}
export async function startAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.startContract(u.id,str(f,"contractId")));}
export async function submitAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.submitWork(u.id,{contractId:str(f,"contractId"),description:str(f,"description"),externalLinks:str(f,"externalLinks").split(/\r?\n/).filter(Boolean),fileUrls:f.getAll("fileUrls").map(String)}));}
export async function revisionAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.requestRevision(u.id,str(f,"contractId"),str(f,"reason")));}
export async function approveAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.approveSubmission(u.id,str(f,"contractId")));}
export async function releaseAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.releasePayment(u.id,str(f,"contractId")));}
export async function reviewAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.reviewContract(u.id,{contractId:str(f,"contractId"),rating:num(f,"rating"),qualityRating:num(f,"qualityRating"),communicationRating:num(f,"communicationRating"),timelinessRating:num(f,"timelinessRating"),comment:str(f,"comment")}));}
export async function profileAction(f:FormData){const u=await requireUser();await run("/profile",()=>service.updateProfile(u.id,{name:str(f,"name"),college:str(f,"college"),degree:str(f,"degree"),year:num(f,"year"),bio:str(f,"bio"),city:str(f,"city"),weeklyHours:num(f,"weeklyHours"),workMode:str(f,"workMode"),skillIds:f.getAll("skillIds").map(String),organizationName:str(f,"organizationName"),organizationType:str(f,"organizationType"),description:str(f,"description"),website:str(f,"website")}));}
export async function bookmarkAction(f:FormData){const u=await requireUser();await run(`/tasks/${str(f,"taskId")}`,()=>service.toggleBookmark(u.id,str(f,"taskId")));}
export async function notificationsAction(){const u=await requireUser();await run("/notifications",()=>service.markNotificationsRead(u.id));}
export async function messageAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.sendMessage(u.id,str(f,"contractId"),str(f,"body")));}
export async function reportAction(f:FormData){const u=await requireUser();await run(`/tasks/${str(f,"taskId")}`,()=>service.reportTask(u.id,str(f,"taskId"),str(f,"reason")));}
export async function disputeAction(f:FormData){const u=await requireUser();await run(`/contracts/${str(f,"contractId")}`,()=>service.openDispute(u.id,str(f,"contractId"),str(f,"reason")));}
export async function moderateAction(f:FormData){const u=await requireUser();await run("/admin",()=>service.moderateTaskAdmin(u.id,str(f,"taskId"),str(f,"action")==="reopen"?"reopen":"cancel"));}
export async function userActiveAction(f:FormData){const u=await requireUser();await run("/admin",()=>service.setUserActiveAdmin(u.id,str(f,"userId"),str(f,"active")==="true"));}
export async function resolveDisputeAction(f:FormData){const u=await requireUser();await run("/admin",()=>service.resolveDispute(u.id,str(f,"disputeId"),str(f,"resolution")));}