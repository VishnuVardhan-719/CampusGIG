"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function LoginForm() {
  const router=useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) { router.push("/dashboard"); router.refresh(); }
      else { setError("Invalid credentials or sign-in temporarily unavailable. Try again later."); setPending(false); }
    } catch { setError("Could not connect. Please try again."); setPending(false); }
  }
  return <form onSubmit={login} className="mt-7 space-y-4">
    <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"/></label>
    <label className="block text-sm font-medium">Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"/></label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button disabled={pending} className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white disabled:opacity-50">{pending ? "Signing in…" : "Sign in"}</button>
    <div className="rounded-lg bg-zinc-50 p-4"><p className="text-xs font-semibold text-zinc-600">SANDBOX DEMO ACCOUNTS</p><div className="mt-3 flex flex-wrap gap-2">{["student", "client", "admin"].map(role=><button type="button" key={role} onClick={()=>{setEmail(`${role}@campusgig.demo`);setPassword("CampusGig@2026");}} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs capitalize">{role}</button>)}</div><p className="mt-3 text-xs text-zinc-500">Loads demo credentials. Click Sign in to continue.</p></div>
  </form>;
}