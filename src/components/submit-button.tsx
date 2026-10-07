"use client";
import { useFormStatus } from "react-dom";
export default function SubmitButton({children,className="button"}:{children:React.ReactNode;className?:string}){const {pending}=useFormStatus();return <button type="submit" className={className} disabled={pending}>{pending?"Saving…":children}</button>;}