# Hack day log — CampusGig (8h hackathon)

Stack: Next.js 16 (App Router) + TypeScript, Prisma + PostgreSQL (embedded dev DB on
`localhost:51214`), NextAuth credentials auth, Tailwind 4, shadcn-style primitives, Zod,
Framer Motion (available). Product spec:
`C:\Users\vishn\Downloads\CAMPUSGIG_MASTER_SPEC.md`.

## Environment quirks (learn once, live with forever)
- `set NODE_ENV=development&&` for db/test/lint/typecheck.
- `set NODE_ENV= &&` (unset) for `npm run build` — forcing dev into `next build` crashes
  `/_global-error` prerender (`React useContext` null).
- Local DB is an **embedded** Prisma Postgres; started with `npm run db:local` (needs
  `NODE_ENV=development`). Keep that terminal alive for the whole session.
- `.env` is gitignored. Current values:
  - `DATABASE_URL` / `SHADOW_DATABASE_URL` → embedded instance `localhost:51214/51215`.
  - `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET` set.
  - `DEMO_MODE=true`, `ALLOW_DEMO_RESET=false`.
  - Demo logins: `student@campusgig.demo` / `client@campusgig.demo` / `admin@campusgig.demo`
    / password `CampusGig@2026`.

## DONE (verified)
- [x] Baseline green re-verified: typecheck ✓, lint ✓ (zero warnings), unit 80/80 ✓,
  integration 14/14 ✓, `npm run build` ✓.
- [x] Local DB start repro documented above.
- [x] AI provider audit: apmix key is dead (401→429 quota exhausted). **Switched demo to
  Clixad** (verified live 2026-10-07): added `clixad` to `src/lib/providers.ts` with base URL
  `https://clixad.onrender.com/v1` + default model `gemini-2.5-flash-lite` (free tier, 200,
  zero credits). `.env`: `AI_PROVIDER="clixad"`, `AI_API_KEY=<clixad adg key>`, the apmix
  key retained as a comment. App still falls back to deterministic analyzer if AI missing.
- [x] `scripts/verify-ai.ts` added: calls real `analyzeTask()`; exits 0 only when
  `source==="ai"`. Repro: `set NODE_ENV=development&& npx tsx scripts/verify-ai.ts`.
- [x] Codebase mapped for Talent Field: routes (flat App Router), `getStudentMatch` in
  `src/lib/match-data.ts`, `calculateMatch` in `src/lib/matching.ts`, schema in
  `prisma/schema.prisma`, UI barrel in `src/components/ui.tsx`, styles in `globals.css`
  (palette vars, `.sandbox` demo badge, Geist font).

## TODO (priority order)
1. **Talent Field `/explore`** (signature wow, ~3h): public page. Server fetches open tasks
   + all students, runs `getStudentMatch` against a selected task, renders an interactive SVG
   node canvas (pan/zoom/click → `/students/[id]`) with a ranked-list fallback using the
   **same** match data. Reuse `MatchBreakdown` + `TaskCard`-style stats. Add a nav link in
   `src/components/nav.tsx` under the logged-out set.
2. **Demo-path polish** (~1h): shortlist/reject applicant controls on client task workspace;
   unread `Notification` badge in nav + `/notifications`.
3. **Demo kit** (~1h): 3 screenshots + 1 workflow GIF (use Chrome DevTools), 90-sec script in
   `docs`, rehearse `demo:reset` flow.
4. **Last 5 min before judging:** re-set `.env` to the live provider actually working at demo
   time (apmix if quota resets, else clixad). Run `scripts/verify-ai.ts` to confirm `source: ai`.

## Repro cheat sheet
```powershell
npm run db:local                     :: start embedded Postgres (keep alive)
set NODE_ENV=development&& npm test && npm run test:integration
set NODE_ENV= && npm run build       :: prod build (NODE_ENV UNSET)
set NODE_ENV=development&& npm run dev   :: dev server :3000
npx tsx scripts/verify-ai.ts         :: confirm live AI path
```
