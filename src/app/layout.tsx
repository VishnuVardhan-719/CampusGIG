import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/nav";
import { currentUser } from "@/lib/auth";
import "./globals.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:{default:"CampusGig — Small tasks. Real experience.",template:"%s | CampusGig"},description:"A student micro-task marketplace. Build experience through completed, traceable work."};
export default async function RootLayout({children}:{children:React.ReactNode}){const user=await currentUser();return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><div className="sandbox">DEMO / SANDBOX <span>Explore the workflow. Payments are simulated; demo records are labeled.</span></div><Nav user={user?{name:user.name,role:user.role}:null}/><main id="main">{children}</main><footer className="footer"><Link className="brand" href="/">CampusGig<span className="muted"> / work that counts.</span></Link><span>Student talent. Clear scope. Traceable evidence.</span><span>Sandbox · No real payments</span></footer></body></html>;}