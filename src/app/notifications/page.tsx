import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { notificationsAction } from "@/app/actions";
import { PageHead,Notice,Empty,Badge } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
export default async function Notifications({searchParams}:{searchParams:Promise<{error?:string;success?:string}>}){const user=await requireUser(),items=await db.notification.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:100});return <div className="container" style={{maxWidth:900}}><PageHead eyebrow="Stay in the loop" title="Your inbox" description="Applications, project updates, and the next step—all in one place." action={<form action={notificationsAction}><SubmitButton className="button secondary">Mark all as read</SubmitButton></form>}/><Notice params={await searchParams}/>{items.length?<section className="panel">{items.map(n=><article className="list-item" key={n.id}><div className="row between"><Link href={n.href.startsWith("/")?n.href:"/dashboard"}><h3>{n.title} ↗</h3></Link>{!n.readAt&&<Badge>Unread</Badge>}</div><p className="muted prose">{n.body}</p><small className="muted">{date(n.createdAt)}</small></article>)}</section>:<Empty title="You’re all caught up">Updates appear here as your work moves forward.</Empty>}</div>;}