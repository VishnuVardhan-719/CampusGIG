-- P0 trust hardening:
--   1. freeze the agreed brief on every contract (scope lock),
--   2. record server-side revision allowance usage,
--   3. enforce money, rating and evidence bounds in the database itself.
-- The application-level rules live in src/lib/domain.ts; these constraints keep a
-- bug, a manual query or a future code path from writing state the rules forbid.

-- AlterTable: revision allowance usage counter (see MAX_REVISION_COUNT).
ALTER TABLE "Contract" ADD COLUMN "revisionCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: frozen agreed brief. Added nullable, backfilled from the live task,
-- then made NOT NULL so no contract can exist without a captured scope.
ALTER TABLE "Contract" ADD COLUMN "scopeSnapshot" JSONB;

UPDATE "Contract" c
SET "scopeSnapshot" = jsonb_build_object(
  'title', t."title",
  'description', t."description",
  'category', t."category",
  'difficulty', t."difficulty"::text,
  'budgetMin', t."budgetMin",
  'budgetMax', t."budgetMax",
  'estimatedHours', t."estimatedHours",
  'workMode', t."workMode"::text,
  'location', t."location",
  'requiredSkills', COALESCE((
    SELECT jsonb_agg(s."name" ORDER BY s."name")
    FROM "TaskSkill" ts
    JOIN "Skill" s ON s."id" = ts."skillId"
    WHERE ts."taskId" = t."id"
  ), '[]'::jsonb),
  'revisionAllowance', 1,
  'capturedAt', to_char(c."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
FROM "Task" t
WHERE t."id" = c."taskId" AND c."scopeSnapshot" IS NULL;

ALTER TABLE "Contract" ALTER COLUMN "scopeSnapshot" SET NOT NULL;

-- Guardrails: contract terms and revision allowance.
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_agreedAmount_positive" CHECK ("agreedAmount" > 0),
  ADD CONSTRAINT "Contract_revisionCount_within_limit" CHECK ("revisionCount" >= 0 AND "revisionCount" <= 1);

-- Guardrails: task budgets and effort.
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_budget_range" CHECK ("budgetMin" >= 0 AND "budgetMax" >= "budgetMin"),
  ADD CONSTRAINT "Task_estimatedHours_positive" CHECK ("estimatedHours" > 0);

-- Guardrails: proposals.
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_proposedPrice_positive" CHECK ("proposedPrice" > 0),
  ADD CONSTRAINT "Application_estimatedHours_positive" CHECK ("estimatedHours" > 0);

-- Guardrails: the sandbox ledger cannot hold a negative amount, and each row type must
-- have the shape the app produces for it — escrow rows balance exactly, payout and fee
-- rows describe a distribution (which must never exceed the row amount), and a refund is
-- money returned to the client rather than a split, so it carries no fee or payout.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amounts_non_negative" CHECK ("amount" >= 0 AND "platformFee" >= 0 AND "studentPayout" >= 0),
  ADD CONSTRAINT "Transaction_row_shape" CHECK (
    "platformFee" + "studentPayout" <= "amount"
    AND ("type" <> 'ESCROW_FUND' OR "platformFee" + "studentPayout" = "amount")
    AND ("type" <> 'REFUND' OR ("platformFee" = 0 AND "studentPayout" = 0))
  );

ALTER TABLE "Milestone"
  ADD CONSTRAINT "Milestone_amount_non_negative" CHECK ("amount" >= 0);

-- Guardrails: ratings stay on the documented 1-5 scale.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_ratings_in_range" CHECK (
    "rating" BETWEEN 1 AND 5 AND "qualityRating" BETWEEN 1 AND 5
    AND "communicationRating" BETWEEN 1 AND 5 AND "timelinessRating" BETWEEN 1 AND 5
  );

-- Guardrails: evidence strength is a 0-1 fraction, never an invented number.
ALTER TABLE "SkillEvidence"
  ADD CONSTRAINT "SkillEvidence_score_fraction" CHECK ("score" >= 0 AND "score" <= 1);

ALTER TABLE "StudentProfile"
  ADD CONSTRAINT "StudentProfile_weeklyHours_range" CHECK ("weeklyHours" >= 0 AND "weeklyHours" <= 168);
