# CampusGig

**Earn. Build. Prove.** A student micro-task marketplace where completed work becomes traceable career evidence.

> **North star:** `WORK → PROOF → REPUTATION → OPPORTUNITY`
> A student's degree says what they studied. Their CampusGig record shows what they can actually do.

CampusGig is deliberately **not** a Fiverr/Upwork clone and **not** a fake-trust demo. Every number on screen is derived from database state, every state change has a rule, and nothing is labelled "verified" that the system cannot actually back up.

---

## 1. The core loop

```
student posts skills -> client posts a task -> AI structures the brief (optional)
   -> deterministic match score -> student applies -> client hires (sandbox escrow recorded)
   -> student submits work -> client approves or requests ONE revision
   -> sandbox payout released -> skill evidence + portfolio item created
   -> client reviews -> public profile and the rankings board update from the database
```

---

## 2. Status

| Area | State |
|---|---|
| Authentication, roles, session scoping | Working |
| Task creation, AI brief analysis with deterministic fallback | Working |
| Marketplace, search, bookmarking, matching explanations | Working |
| Applications, hiring, contracts, submissions, revisions, approval | Working |
| Sandbox ledger (escrow -> payout + fee), disputes, refunds | Working |
| Reviews, work-backed skill evidence, portfolio, public profiles | Working |
| Builder rankings board (`/rankings`) with a home teaser | Working |
| Admin moderation, reports, dispute resolution, audit trail | Working |
| P0 trust/abuse hardening (this session) | Working - see section 7 |
| Granular verification states, identity uniqueness, GitHub/LinkedIn evidence | **Not built** - see section 10 |

**Honest scope note:** the app never claims a student's identity, college or external skill is verified. `verificationStatus` is display-only today (every demo account is `UNVERIFIED`) and the profile copy says so explicitly. That is deliberate: we would rather under-claim than fake trust.

---

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.8 (App Router, Turbopack), React 19.3 |
| Language | TypeScript (strict) |
| Styling | Tailwind 4 plus hand-written CSS in `src/app/globals.css` |
| Database | PostgreSQL via Prisma 7 with a **custom generated client at `src/generated/prisma`** |
| DB driver | `@prisma/adapter-pg` against the embedded `@prisma/dev` Postgres (port 51214) |
| Auth | NextAuth 4 (credentials, JWT sessions, bcryptjs) |
| Validation | Zod 4 on every server input |
| Tests | Vitest (unit + integration), Playwright (e2e), custom smoke script |

No dependency was added for animation, state management or UI: the rankings motion is CSS plus `IntersectionObserver`.

> **Prisma gotcha:** enum types must be imported from `@/generated/prisma/enums`, **not** `@prisma/client`. This project uses the new `prisma-client` generator with an explicit output path.

---

## 4. Local setup

Node 24+ (this machine used Node 26.7), npm, Git. Docker is not required - the local database is an embedded Prisma development server.

Terminal 1:

```bash
npm install          # runs `prisma generate` via postinstall (src/generated/ is gitignored)
npm run db:local     # embedded Postgres on 51214; keep this running
```

Terminal 2:

```bash
node scripts/setup-env.mjs            # creates .env with a random auth secret (refuses to overwrite)
node scripts/bootstrap-local-db.mjs   # Prisma + PGlite first-migration workaround (issue #29366)
npm run db:migrate                    # apply migrations
npm run seed                          # 10 students, 6 clients, 1 admin, 20 tasks, 6 contracts
npm run dev                           # http://localhost:3000
```

`setup-env.mjs` never overwrites an existing `.env`. Use `.env.example` for external PostgreSQL and set `DATABASE_URL`, `SHADOW_DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. Never commit credentials.

**Required quirk:** against the embedded Prisma dev server the CLI needs an explicit schema in the URL:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable&schema=public"
```

Without `&schema=public`, `prisma migrate status/deploy` cannot see its own `_prisma_migrations` table and fails with `Invariant violation: migration persistence is not initialized`. This is already set in `.env.example` and in the `prisma.config.ts` fallback. The runtime client ignores the parameter (it always uses `public`), so it is harmless there.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | student@campusgig.demo | CampusGig@2026 |
| Client | client@campusgig.demo | CampusGig@2026 |
| Admin | admin@campusgig.demo | CampusGig@2026 |

Public sandbox credentials. Never seed them onto a public production service. Reseeding preserves existing fixture rows, so repeat seeding does not erase a demo in progress.

---

## 5. Routes

| Route | Purpose |
|---|---|
| `/` | Landing plus top-3 builder teaser |
| `/login`, `/signup` | Credentials auth; signup is limited to STUDENT or CLIENT |
| `/dashboard` | Role-scoped overview (contracts, applications, earnings from completed work) |
| `/tasks` | Marketplace with matching |
| `/tasks/new` | Client task creation plus AI brief analysis |
| `/tasks/[id]` | Brief, applicant comparison, apply, report |
| `/contracts`, `/contracts/[id]` | Workspace: submission, revision, approval, release, messages, dispute, review |
| `/students/[id]` | Public profile: work-backed evidence, portfolio, reviews, self-declared skills |
| `/rankings` | Public builder rankings (top-3 podium, full ranked list, "awaiting a first review") |
| `/explore` | Talent explorer (batched skill queries plus match scoring) |
| `/profile`, `/notifications`, `/admin` | Profile editing, notification inbox, platform operations |
| `/api/ai/analyze-task`, `/api/auth/[...nextauth]`, `/api/uploads[/id]` | AI analysis, auth, private uploads |

---

## 6. Architecture

### 6.1 One authorization chain for every mutation

`src/server/services.ts` exposes 22 mutations. Every one runs through a single wrapper:

```
session -> actor lookup (active?) -> role assertion -> ownership/participation
   -> Zod parse -> CURRENT DB STATE (guarded updateMany on the expected status)
   -> business rule -> db.$transaction -> notification + audit row -> response
```

The guarded `updateMany({ where: { id, status: expectedStatus } })` pattern means a stale read loses the race instead of producing a double state change. Nothing trusts a hidden form field or a browser role.

### 6.2 The state machine is law

`src/lib/domain.ts` holds the contract transition table:

```
PENDING -> IN_PROGRESS -> SUBMITTED -> APPROVED -> COMPLETED
                 ^            |
                 +--- REVISION_REQUESTED
CANCELLED / DISPUTED are terminal for the normal flow
```

Illegal transitions (approve before submit, release twice, review before completion) throw. Covered by unit tests.

### 6.3 Idempotency comes from constraints, not hope

- `Application @@unique([taskId, studentId])` - one application per student per task
- `Contract.taskId @unique`, `Contract.applicationId @unique` - one contract per task
- `Review @@unique([contractId, reviewerId])` - one review per participant
- `Transaction @@unique([contractId, type])` - one escrow row, one release per contract
- `SkillEvidence @@unique([studentId, skillId, contractId, sourceType])`

Hire-twice returns the existing contract; release-twice returns the completed contract; duplicate applications and reviews are rejected with explicit messages.

### 6.4 Matching and rankings are deterministic

- `src/lib/matching.ts` - 7 weighted components (skills 35, portfolio 20, availability 15, past work 10, on-time 10, rating 5, work mode 5). Emits `{key,label,value,weight,reason}` so the UI renders the same numbers used in the maths. Unknown rating/on-time use a **labelled** neutral prior of 50, never a zero.
- `src/lib/rankers.ts` - builder score (rating 30, on-time 20, completed 20, work-backed skills 20, identity 10). Unobserved components are excluded and the remaining weights renormalised; `score: null` when a student has no reviews.
- `BUILDER_COMPONENTS` is the single source of truth for both the engine and the on-page legend, so a displayed weight cannot drift from the calculation.

**Code calculates. AI explains.** The model never produces a score, a state change, or a reputation number.

### 6.5 Evidence model

`SkillEvidence` is created only when a contract reaches `COMPLETED`, from the task's required skills (`sourceType: COMPLETION`, score 1) and again from a client review (`sourceType: REVIEW`, score = quality/5). Portfolio items created on release are linked to the contract, which is why the public profile can label them **Verified Work** and explain where the claim comes from. Claimed skills are shown separately as self-declared.

### 6.6 Payments are honest sandbox state

Amounts are integer paise (INR); the platform fee is 5%, rounded to the nearest paise. The ledger has explicit types with well-defined shapes:

```
ESCROW_FUND     amount = agreed amount,  platformFee + studentPayout = amount
PAYOUT_RELEASE  amount = student payout, platformFee = 0
PLATFORM_FEE    amount = platform fee,   studentPayout = 0
REFUND          amount = refunded total, no fee and no payout (dispute resolution)
```

Every payment surface says **"Sandbox ledger only. No real money is charged or transferred."**

---

## 7. P0 trust and abuse hardening (built in this session)

Source: the final war-prompt directive, reviewed item by item against the code. Files touched: `src/lib/domain.ts`, `src/server/services.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, one migration, and tests.

### 7.1 Scope lock - the client cannot silently re-scope a contract

`Contract.scopeSnapshot` (JSONB, **NOT NULL**) freezes title, description, category, difficulty, budget range, estimated hours, work mode, location, required skills, revision allowance and capture timestamp **at hire time**.

- Built by `buildContractScope()` in `src/lib/domain.ts`, validated by `contractScopeSchema`.
- It is a **copy**, not a reference: editing the task row later cannot rewrite the frozen brief (an integration test mutates the task and asserts the snapshot is unchanged).
- Rendered on the contract page as *"Agreed scope - frozen when the contract started"*.
- The migration backfilled snapshots for pre-existing contracts, then set the column `NOT NULL` so no contract can exist without one.

### 7.2 Server-enforced revision limit

`MAX_REVISION_COUNT = 1` in `src/lib/domain.ts`. `Contract.revisionCount` is incremented inside the guarded transition, and `assertRevisionAllowed()` runs **before** it, so a blocked revision leaves zero partial state (verified in tests).

- Postgres enforces it too: `CHECK (revisionCount BETWEEN 0 AND 1)`.
- The contract page shows `n of 1 used` and hides the revision form once the allowance is spent while still allowing approval (or a dispute) - the limit blocks unlimited rework, not legitimate acceptance.

### 7.3 Append-only trust history

Every important mutation now writes an `AuditLog` row inside the same transaction:

```
TASK_CREATED, APPLICATION_SUBMITTED, CONTRACT_CREATED, SUBMISSION_SUBMITTED,
REVISION_REQUESTED, SUBMISSION_APPROVED, CONTRACT_COMPLETED, EVIDENCE_RECORDED,
REVIEW_CREATED, DISPUTE_OPENED, PROFILE_UPDATED, TASK_CANCEL/REOPEN,
USER_ACTIVE, DISPUTE_REFUND
```

`PROFILE_UPDATED` records **which** identity-relevant fields changed (`name`, `college`, `degree`, `year`) and deliberately does not log previous values. Nothing in the app can delete trust history.

### 7.4 Database guardrails (12 CHECK constraints)

Money, rating and evidence bounds are enforced by Postgres, not only by Zod:

| Table | Constraint |
|---|---|
| `Contract` | `agreedAmount > 0`; `revisionCount` between 0 and 1 |
| `Task` | `budgetMin >= 0 AND budgetMax >= budgetMin`; `estimatedHours > 0` |
| `Application` | `proposedPrice > 0`; `estimatedHours > 0` |
| `Transaction` | all amounts non-negative; per-type row shape (see 6.6) |
| `Milestone` | `amount >= 0` |
| `Review` | all four rating columns between 1 and 5 |
| `SkillEvidence` | `score` is a 0-1 fraction |
| `StudentProfile` | `weeklyHours` between 0 and 168 |

**This caught a real bug.** The first version required `platformFee + studentPayout = amount` on every ledger row, which the integration suite immediately failed: a `REFUND` row carries the refunded total with no split. The constraint was reshaped per transaction type instead of being weakened globally.

### 7.5 Test suites no longer write to the demo database

The demo database had accumulated 6 stray "Integration fixture" student accounts, 12 fixture users in total, and 6 non-demo "Golden demo poster" contracts that permanently inflated the seeded student's completed count and appeared on the public rankings board.

- `scripts/test-db.mjs` starts a **stateless throwaway** `@prisma/dev` Postgres on ports 51223-51226, migrates it, and runs the suite against it. `npm run test:integration` is now fully isolated; it cannot touch the database in `.env`.
- The integration suite **refuses to run** against a database holding `@campusgig.demo` accounts, so a direct `vitest run tests/integration` fails loudly instead of polluting the demo.
- Playwright cannot use a second dev server (Next 16 refuses a second instance for one project), so the golden path now **sweeps its own fixtures before and after the run** - task, contract, submissions, reviews, ledger, notifications and audit rows - and cleans up residue from interrupted runs. A browser test no longer changes the demo numbers.
- The demo database was rebuilt from migrations plus seed and verified as fixture-only: **17 users (all `@campusgig.demo`), 20 tasks, 6 contracts, 14 ledger rows, 0 non-demo rows.**

### 7.6 Unified demo ledger shape

The seed previously wrote a `PAYOUT_RELEASE` row carrying the full contract amount and no `PLATFORM_FEE` row, while a live run writes a payout row **and** a separate fee row. Seeded and live ledgers now have the same shape, so a judge comparing them sees identical structure.

---

## 8. Verification

```bash
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm test                  # vitest run tests/unit
npm run test:integration  # throwaway database (scripts/test-db.mjs)
npm run test:e2e          # Playwright golden path
npm run verify:aggregates # database-derived consistency audit
npm run build             # prisma generate && next build
node tests/ui-smoke.mjs   # 20 route visits at 1440px and 360px
```

`npm run verify:aggregates` is the borrowed "prove your own numbers" pattern: it recomputes published aggregates independently through Postgres (`db.review.aggregate`) and exits non-zero on any mismatch. It checks:

1. published review count and average equal the Postgres aggregation, for every ranked and awaiting student;
2. every ledger row has the shape its type requires;
3. payout releases exist once, only after completion, and match the 5% split rule;
4. `SkillEvidence` only on completed contracts;
5. reviews only on completed contracts, only between participants;
6. every contract has a valid frozen scope, and its agreed amount sits inside the frozen budget;
7. revision usage is re-derivable from submission history, so `revisionCount` cannot drift.

### Results after the hardening work

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `eslint .` | Pass |
| `npm test` (unit) | **112 passed** (6 files). 98 before, +14 for the revision limit and scope snapshot |
| `npm run test:integration` | **18 passed** on the throwaway database, including 5 new hardening tests |
| `npm run verify:aggregates` | Pass - 4 reviewed students, no mismatches |
| `npm run build` | Pass - 20 routes, `/rankings` included |
| Demo database after an integration run | 0 non-demo rows, so isolation is proven |
| Migration state | 2 migrations applied, `Database schema is up to date!` |

**Needs one re-run on the new machine:** `npm run test:e2e` and `node tests/ui-smoke.mjs`. Both were last green before the hardening migration. They need a running `npm run dev` on port 3000 with the seeded data. Run them once after `npm install` and record the result rather than assuming they pass.

---

## 9. Project structure

```
prisma/
  schema.prisma                 20 tables; Contract.scopeSnapshot + revisionCount are the new fields
  migrations/
    20261001161208_init/
    20261007190000_p0_trust_hardening/   scope snapshot + 12 CHECK constraints
  seed.ts                       deterministic demo fixtures (uses buildContractScope)
src/
  lib/
    domain.ts                   state machine, payment split, scope snapshot, moderation, input schemas
    matching.ts                 deterministic 7-component matcher
    match-data.ts               gathers real student history for the matcher
    rankers.ts                  builder ranking engine + BUILDER_COMPONENTS
    rank-data.ts                single batched loader for the rankings board
    ai.ts                       AI brief analysis: prompt-injection posture, Zod validation, fallback
    auth.ts                     NextAuth options, local login throttle, session helpers
    db.ts                       Prisma client with the pg adapter
    format.ts, upload.ts, providers.ts
  server/services.ts            22 server-authorized mutations (the security boundary)
  app/                          routes (see section 5), server actions in actions.ts, globals.css
  components/                   nav, UI kit, reveal (IntersectionObserver), ranked list, talent field, uploads
  generated/prisma/             generated client - do not edit
tests/
  unit/                         6 files / 112 tests
  integration/workflow.test.ts  18 tests on a throwaway database
  e2e/golden-path.spec.ts       full lifecycle browser run with fixture hygiene
  ui-smoke.mjs                  20-route responsive smoke check
scripts/
  local-db.mjs                  embedded Postgres
  test-db.mjs                   throwaway database runner for the integration suite
  verify-aggregates.ts          database-derived consistency audit
  demo-reset.ts                 rebuild fixtures (requires DEMO_MODE + ALLOW_DEMO_RESET + --confirm)
  bootstrap-local-db.mjs, setup-env.mjs, verify-seed.ts, verify-ai.ts
docs/
  plans/2026-10-07-rankers.md   rankings build note: reference adopt/skip table, measurements, limitations
  plans/...                     earlier build plans
HACKATHON_HANDOFF.md            handoff notes (AI provider status, demo kit)
```

---

## 10. What's next

The hardening directive was reviewed item by item. Everything below was **deliberately deferred**. Each item is a real gap, not an oversight.

### P0 follow-ups (small, high value)

1. **Resolve the dead identity signal.** `verificationStatus` is never written by any code path, so every account is `UNVERIFIED` and the rankings "identity status" component is 0 for every builder. It caps every score by 10 points for a condition nobody can satisfy. Either build a real admin verification decision (evidence -> review -> decision -> audit) or remove the component from the ranking maths.
2. **Identity uniqueness beyond email.** One person can hold a `STUDENT` and a `CLIENT` account and run a fake reputation loop. Signup accepts any email address, there is no college-domain check, and canonicalisation stops at lowercasing. Needs one verified identity per student account plus an audited merge/recovery path.
3. **Evidence provenance fields.** `SkillEvidence` has `sourceType`, `metadata` and `createdAt`, but no `source_reference`, `verification_method`, `confidence`, `last_verified_at` or `status` (`ACTIVE`/`STALE`/`REVOKED`/`CONFLICTED`). Portfolio items have no contribution classification (`SELF`/`TEAM`/`CONTRIBUTION`/`FORK`/`UNKNOWN`) and no deliverable anchoring (repository plus commit SHA recorded at submission time).

### P1 (after P0 is stable)

- External evidence: GitHub connection with fork-versus-original distinction and immutable provider IDs; LinkedIn treated as explicitly `SELF_REPORTED`; conflicting evidence represented instead of silently picking the most impressive claim.
- Collusion signals: reciprocal-pair detection, counterparty diversity, tiny-task farming, review concentration. Presented as **risk signals that route to review**, never as a fraud verdict.
- Client trust surface: completed hiring history, approval and cancellation behaviour (reviews already support a client as `reviewee`, but no client profile page exists).
- Timeline consistency flags (portfolio claim dates versus repository creation dates).
- Admin verification queue and risk review tooling.
- Richer portfolio evidence: re-verification timestamps and `STALE` classification.

### P2 (explicitly out of scope)

Social feed, video calls, teams, subscriptions, crypto or blockchain reputation, complex escrow or invoicing, AI chatbot, AI-generated proposals, analytics suites, native mobile apps, multi-tenant institution management.

### Process notes for whoever picks this up

- **Do not bolt Supabase or RLS onto this repository.** The hardening directive references Supabase in places, but this build is Prisma plus NextAuth, so its "RLS/security tests" gate is not applicable. The equivalent guarantees here are the `authorized()` transaction wrapper and the CHECK constraints. Adding Supabase to satisfy a checklist line would be a regression.
- **The Master Spec is canonical for weights, not the hardening prompt.** The war prompt compresses the matcher into six components; the shipped matcher has seven (work-mode compatibility is the seventh). Same intent - decide which is canonical before "fixing" it.
- **Never relax a CHECK constraint to make a test pass.** One of them already caught a genuine bug (section 7.4).
- **Never point the integration suite at the demo database.** If it refuses to run, that guard is working.
- **`npm run demo:reset -- --confirm`** rebuilds only `demo-` prefixed fixtures and preserves real accounts.

---

## 11. Known limitations

- Payments, escrow, earnings and "verified" work are **simulated**. No money moves, and nothing here is a legal record of employment, payment or institutional verification.
- The login rate limit is an in-memory map that only protects a single process (documented in `src/lib/auth.ts`).
- `Skill` has no canonical slug table; matching runs on lowercased names, so aliases such as `React` and `React.js` are not unified. Low practical impact today because tasks and profiles reference real `Skill` rows, and AI-suggested skills are never persisted as skills.
- The demo database is an embedded development Postgres, not a production database server.
- File storage is local disk and is not durable on serverless hosts. No cloud storage is provisioned.
- Concurrency guarantees are enforced by conditional updates and unique constraints and were tested against a single-connection embedded database. Re-verify against an independent multi-session PostgreSQL server before production.
- No AI provider is configured by default, so the demo exercises the labelled deterministic fallback. A live provider call has not been verified end to end.

---

## 12. Uploading this to Git

This repository currently has **zero commits** - every file is untracked. Before the first commit:

1. Confirm `.gitignore` covers `.env`, `.local/`, `.next/`, `node_modules/`, `uploads/`, `test-results/` and `playwright-report/`.
2. Run `git add .` and review `git status`: no secrets, no generated `.next` output, no uploaded demo files.
3. Make sure both migrations are included (`prisma/migrations/**`). The schema cannot be rebuilt without them.
4. Suggested first commit message: `CampusGig: student micro-task marketplace with evidence-backed work records and P0 trust hardening`.

```bash
git remote add origin https://github.com/VishnuVardhan-719/CampusGIG.git
git add .
git commit -m "CampusGig: student micro-task marketplace with evidence-backed work records and P0 trust hardening"
git push -u origin main
```

Keep `DATABASE_URL`, `NEXTAUTH_SECRET` and any AI provider key out of the repository. `.env.example` documents every variable a fresh clone needs.
