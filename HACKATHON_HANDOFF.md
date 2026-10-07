# CampusGig — Hack day handoff

Use this to pick the work up with **any model**. Everything is a checkbox you can re-verify.

## HOW TO START (run these every time)
```powershell
cd C:\Hackathon\Wednesday
npm run db:local            # keeps embedded Postgres alive for the whole session (port 51214)
```
Leave that terminal running. In a new terminal:
```powershell
set NODE_ENV=development&& npm run dev
```
Site: `http://localhost:3000`. Demo login: `student@campusgig.demo` / `CampusGig@2026`.

## WHAT WE COMPLETED ✅
- Baseline is green: `typecheck`, `lint`, unit tests (80), integration tests (14), and `npm run build` all pass.
- Switched live AI to **Clixad** (apmix key is dead — quota exhausted). `.env` has `AI_PROVIDER="clixad"`, a working key, and `AI_MODEL="claude-sonnet-4-6-free"` is ignored. Added `clixad` to `src/lib/providers.ts`. Live JSON task analysis works.
- Added `scripts/verify-ai.ts` — proves a real AI call. Run: `set NODE_ENV=development&& npx tsx scripts/verify-ai.ts`.
- Mapped the codebase so the next feature is obvious: matching lives in `src/lib/matching.ts` + `src/lib/match-data.ts`; data model in `prisma/schema.prisma`; UI in `src/components/ui.tsx`; styles in `src/app/globals.css`.
- Wrote this handoff doc.

## WHAT WE LEFT UNDONE ⌛
1. **Talent Field `/explore`** — the signature wow page. Needs a public Next page at `src/app/explore/page.tsx` that plots students as nodes (axes = match score vs rating) with pan/zoom/click, plus a ranked list. Reuse `getStudentMatch()` and `MatchBreakdown`. (I only read the surrounding files; nothing built yet.)
2. **Shortlist/reject controls** — client-side UI to shortlist or reject applicants on `/contracts/.../applicants` (the server logic and `ApplicationStatus` enum already exist).
3. **Unread notification badge** — small nav counter on `/notifications`.
4. **Demo kit** — screenshots + 90-second demo script for judging.

## ENV KEYS (already in `.env`, do not share)
- apmix: dead (quota). Keep commented as reference.
- Clixad: live (free-tier `gemini-2.5-flash-lite`). Used now.
- All real auth/payment/skill data is fake demo data — see `prisma/seed.ts`.

## ONE-THING-TO-RUN-NEXT
Build `/explore` (item 1 above). Everything needed is documented — `getStudentMatch(task)` returns `{score,breakdown,reasons}`.
