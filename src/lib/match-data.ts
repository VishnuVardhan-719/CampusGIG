import { db } from "@/lib/db";
import { calculateMatch } from "@/lib/matching";
type MatchTask={id:string;difficulty:"BEGINNER"|"INTERMEDIATE"|"ADVANCED";deadline:Date;estimatedHours:number;workMode:"REMOTE"|"ONSITE"|"HYBRID";location:string|null;skills:{skill:{name:string}}[]};
export async function getStudentMatch(userId:string,task:MatchTask){
  const [profile,skills,portfolio,completed,reviews]=await Promise.all([
    db.studentProfile.findUnique({where:{userId}}),
    db.studentSkill.findMany({where:{userId},include:{skill:true}}),
    db.portfolioItem.findMany({where:{studentId:userId},select:{title:true,description:true}}),
    db.contract.findMany({where:{studentId:userId,status:"COMPLETED"},include:{task:{include:{skills:{include:{skill:true}}}}}}),
    db.review.findMany({where:{revieweeId:userId},select:{rating:true}}),
  ]);
  const required=task.skills.map(s=>s.skill.name);
  const relevant=(text:string)=>required.some(s=>text.toLowerCase().includes(s.toLowerCase()));
  const hoursUntilDeadline=Math.max(0,(task.deadline.getTime()-Date.now())/3600000);
  const availableHours=(profile?.weeklyHours??0)*Math.min(hoursUntilDeadline/168,1);
  const compatible=task.workMode==="REMOTE"||((profile?.workMode==="ONSITE"||profile?.workMode==="HYBRID")&&!!task.location&&profile.city.toLowerCase()===task.location.toLowerCase());
  return calculateMatch({requiredSkills:required,studentSkills:skills.map(s=>s.skill.name),difficulty:task.difficulty,relevantPortfolioItems:portfolio.filter(p=>relevant(p.title+" "+p.description)).length,availableHours,estimatedHours:task.estimatedHours,hoursUntilDeadline,relevantCompletedTasks:completed.filter(c=>c.task.skills.some(s=>required.includes(s.skill.name))).length,onTimeRate:completed.length?completed.filter(c=>c.completedAt&&c.completedAt<=c.deadline).length/completed.length:null,ratingAverage:reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:null,workModeCompatible:compatible});
}