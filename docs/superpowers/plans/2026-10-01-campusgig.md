# CampusGig Implementation Plan

> For agentic workers: use subagent-driven-development or executing-plans. Track each gate below; never mark a feature complete without executing its check.

**Goal:** Deliver the working student micro-task marketplace whose completed contracts produce traceable career evidence.

**Architecture:** Next.js App Router monolith, PostgreSQL and Prisma, credential authentication with JWT sessions, server-authorized business services shared by Server Actions and necessary route handlers. No duplicate repository layer. Sandbox payments only, integer paise and transactionally enforced lifecycle.

**Tech stack:** Verified registry versions pinned in package.json. Next.js 16.3.8, React 19.3, Prisma 7.10 (not the Prisma 8 release candidate), stable NextAuth 4.24.15 (not v5 beta), TypeScript 5.9, Tailwind 4, Zod, Vitest and Playwright. Bcryptjs avoids native password dependencies. Node installed: 26.7; production target supported Node 24.

**Spec:** C:\Users\vishn\Downloads\CampusGig_FINAL_BUILD_PROMPT_README.md (original untouched).

## Global constraints

- PostgreSQL, foreign keys, enums, indexes and reproducible migrations; no JSON-only relationships.
- Every completed task becomes verified evidence; claimed skills are not certification.
- No fake buttons, hard-coded match scores, real-payment claims, or false college verification.
- Currency INR; amounts in integer paise; 5% fee rounded to nearest paise.
- Demo accounts student/client/admin@campusgig.demo; development-only password documented.
- Recheck role, ownership and active user state for each protected mutation.
- Task states separate from contract states; revision returns to IN_PROGRESS before resubmission.
- Missing history shown as unknown, not zero quality; matcher uses explicitly documented neutral priors.
- Link-based submissions work; file uploads require authorization, size/type validation and private serving.
- No external deployment, destructive remote reset or provisioning without authorization.

## Task 1: Foundation and data

- [x] Create package/config files and install locked dependencies. npm install completed; schema validated.
- [x] Implement Prisma schema at C:\Hackathon\Wednesday\prisma\schema.prisma, config at C:\Hackathon\Wednesday\prisma.config.ts, singleton at C:\Hackathon\Wednesday\src\lib\db.ts. Produce User/StudentProfile/ClientProfile/Organization/Skill/StudentSkill/PortfolioItem/Task/TaskSkill/Application/Contract/Milestone/Submission/Review/Transaction/Notification/Message/Dispute/Report/SkillEvidence/AuditLog/Bookmark with unique constraints.
- [x] Start named local Prisma Postgres, persist connection in ignored .env and run migration. Applied 20261001161208_init after documented PGlite metadata bootstrap.
- [x] Idempotent seed: two successful runs. Count verification: 10 students, 6 clients, 1 admin, 20 tasks, 6 contracts, 16 synthetic evidence rows.

## Task 2: Pure business rules, test first

- [x] C:\Hackathon\Wednesday\tests\unit\domain.test.ts asserts: 300000 paise -> 15000 fee + 285000 payout, reject negative/non-integer, invalid transition rejected, unauthorized roles rejected, truthful capped matching and missing-history handling, rule moderation blocks cheating but permits tutoring.
- [x] Run failing tests; implement domain/matching/AI/upload validation; rerun green (79 unit tests).
- [x] Matching seven components weighted .35/.20/.15/.10/.10/.05/.05; all inputs validated, no division-by-zero, skills deduplicated; history priors .5 for rating/on-time, explanation notes unknown values. Availability capped by actual time remaining. No forced 94% output.

## Task 3: Authentication and P0 services

- [x] Credential login/signup with Zod and bcryptjs; default STUDENT/CLIENT only; active-state revalidation at each service call. Add login throttling and generic invalid-credential errors.
- [x] C:\Hackathon\Wednesday\src\server\services.ts exposes createTask/apply/hire/startContract/submit/requestRevision/approve/releasePayment/review/editProfile, with one authorization and transaction boundary per write.
- [x] Integration tests at C:\Hackathon\Wednesday\tests\integration\workflow.test.ts use disposable test records and verify full lifecycle, cross-user denial, repeated hire/payment and review protections. Never run destructive tests on production.
- [x] Unique task contract, task/student application, contract/reviewer review and contract/type transaction constraints. Hiring conditionally updates OPEN task in same transaction; release creates payout and evidence only once.

## Task 4: Product UI and P1

- [x] Landing, login/signup, dashboard, marketplace, task details/create, applicant comparison, contract workspace, public student profile, profile editor, notifications. Server components and real service-backed actions.
- [x] C:\Hackathon\Wednesday\src\lib\ai.ts exposes structured task analysis, timeout, validated output and explicit source=AI/fallback; deterministic parser without key. AI never authorizes writes, determines payments or changes a task without confirmation.
- [x] Display score breakdown and real evidence links. Skill confidence based on platform-backed completions/reviews; claimed proficiency displayed separately. Label all seeded data as demo.
- [x] Match filters, bookmarks, responsive navigation, visible focus, semantic labels, submit pending/error/success and page loading/error/empty states.

## Task 5: P2 and acceptance

- [x] Contract messages, notifications read tracking, basic admin moderation, reports/disputes, basic live metrics. Do not build unused milestone UI.
- [x] Private uploads validated and stored locally for local demo; README states production needs durable storage. No local filesystem deployment claims.
- [x] Playwright golden workflow includes revision, release, review, work/evidence update and all three role logins. Check mobile overflow and browser console.
- [x] README with setup, migration/seed, demo credentials, AI variables, tests, sandbox and future constraints. Demo reset requires explicit opt-in and refuses non-local databases.
- [x] Final gates run: schema validation, migration, seed twice, typecheck (exit 0), ESLint (exit 0), 80 unit tests, 14 integration tests, production build (exit 0), Playwright golden flow (1 passed).

## Execution record

- 2026-10-01: user approved execution; empty dedicated directory, no existing code or Git history. Scaffold started. Docker/psql absent; local Prisma Postgres to be verified before adoption.
- Ruling: use stable NextAuth v4 rather than v5 beta and Prisma 7 rather than 8 RC. This reduces prerelease risk; upgrade only when tested.
- Ruling: keep integration tests; finance/concurrency safety cannot be demonstrated by the golden UI path alone.
- Ruling: use the already-installed @prisma/dev programmatic API with a checked-in script, avoiding runtime CLI subcommand auto-updates. Persist named development data; never deploy this database server.
- Verified: first-migration P1017 reproduced, traced to documented PGlite issue #29366, bootstrap metadata table then actual migrate dev applied successfully. No db push shortcut used.