"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
export default function Nav({user}:{user:{name:string;role:string}|null}) {
 const path=usePathname();
 const links=user?[["/dashboard","Overview"],["/tasks","Find tasks"],["/contracts","Workspace"],["/rankings","Rankings"],["/notifications","Inbox"],["/profile","Profile"],...(user.role==="ADMIN"?[["/admin","Admin"]]:[])]:[["/tasks","Explore tasks"],["/rankings","Rankings"],["/#how-it-works","How it works"]];
 return <header className="site-header"><div className="nav-wrap"><Link href="/" className="brand"><span className="brand-mark">c<span>g</span></span>CampusGig</Link><nav aria-label="Main navigation">{links.map(([href,label])=><Link key={href} href={href} aria-current={path===href?"page":undefined}>{label}</Link>)}</nav><div className="nav-account">{user?<><span className="avatar" title={user.name}>{user.name.slice(0,1)}</span><button className="text-button" onClick={()=>signOut({callbackUrl:"/"})}>Sign out</button></>:<><Link href="/login" className="text-button">Log in</Link><Link href="/signup" className="button small">Get started</Link></>}</div></div></header>;
}