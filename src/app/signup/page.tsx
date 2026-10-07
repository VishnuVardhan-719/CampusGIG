import Link from "next/link";
import { signupAction } from "./signup-action";
export default async function SignupPage({ searchParams }: { searchParams: Promise<{error?:string}> }) {
  const params = await searchParams;
  return <div className="mx-auto max-w-lg px-6 py-16"><section className="rounded-2xl border border-zinc-200 bg-white p-8"><p className="text-sm font-semibold text-indigo-600">EARN. BUILD. PROVE.</p><h1 className="mt-3 text-3xl font-semibold">Join CampusGig</h1><p className="mt-3 text-zinc-500">Start with a profile. Build it with real work.</p>{params.error&&<p role="alert" className="mt-4 text-sm text-rose-700">{params.error}</p>}<form action={signupAction} className="mt-6 space-y-4">
    <label className="block text-sm font-medium">Full name<input name="name" required minLength={2} maxLength={80} autoComplete="name" className="mt-2 w-full rounded-lg border p-3"/></label>
    <label className="block text-sm font-medium">Email<input name="email" required type="email" autoComplete="email" className="mt-2 w-full rounded-lg border p-3"/></label>
    <label className="block text-sm font-medium">Password<input name="password" required type="password" minLength={10} maxLength={72} autoComplete="new-password" className="mt-2 w-full rounded-lg border p-3"/></label>
    <label className="block text-sm font-medium">I want to<select name="role" className="mt-2 w-full rounded-lg border p-3"><option value="STUDENT">Find work as a student</option><option value="CLIENT">Hire student talent</option></select></label>
    <p className="text-xs text-zinc-500">CampusGig is for legitimate micro-work. Academic cheating, impersonation and unsafe services are prohibited. Payments in this build are sandbox simulations.</p>
    <button className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white">Create account</button>
  </form><p className="mt-5 text-sm">Already a member? <Link className="text-indigo-600" href="/login">Sign in</Link></p></section></div>;
}