import "server-only";
import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const credentialsSchema = z.object({ email: z.email().max(254), password: z.string().min(8).max(72) });
// Local demo throttle only; deployed multi-instance auth needs shared rate limiting.
const attempts = new Map<string, { count: number; expires: number }>();
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [Credentials({
    name: "CampusGig",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      const input = credentialsSchema.safeParse(credentials);
      if (!input.success) return null;
      const email = input.data.email.trim().toLowerCase();
      const now = Date.now();
      const prior = attempts.get(email);
      if (prior && prior.expires > now && prior.count >= 8) return null;
      if (attempts.size > 1000) for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
      attempts.set(email, { count: prior && prior.expires > now ? prior.count + 1 : 1, expires: prior && prior.expires > now ? prior.expires : now + 900000 });
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.isActive || !await compare(input.data.password, user.passwordHash)) return null;
      attempts.delete(email);
      return { id: user.id, name: user.name, email: user.email };
    },
  })],
  callbacks: {
    async jwt({ token, user }) { if (user) token.sub = user.id; return token; },
    async session({ session, token }) { if (session.user && token.sub) session.user.id = token.sub; return session; },
  },
};
export async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.isActive ? user : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}