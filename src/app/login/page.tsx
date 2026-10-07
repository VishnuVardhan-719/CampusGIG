import Link from "next/link";
import LoginForm from "./login-form";
export default function LoginPage() {
  return <div className="mx-auto grid min-h-[75vh] max-w-5xl items-center gap-12 px-6 py-16 md:grid-cols-2">
    <section><p className="text-sm font-semibold text-indigo-600">YOUR NEXT OPPORTUNITY</p><h1 className="mt-5 text-5xl font-semibold tracking-tight">Real work.<br/>A stronger story.</h1><p className="mt-6 max-w-sm text-lg text-zinc-600">Earn from what you know. Leave with evidence of what you can do.</p><Link href="/tasks" className="mt-8 inline-block text-sm font-medium text-indigo-600">Explore the marketplace →</Link></section>
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"><h2 className="text-2xl font-semibold">Welcome back</h2><p className="mt-2 text-sm text-zinc-500">Sign in to your CampusGig account.</p><LoginForm/><p className="mt-6 text-sm text-zinc-600">New here? <Link className="font-medium text-indigo-600" href="/signup">Create an account</Link></p></section>
  </div>;
}