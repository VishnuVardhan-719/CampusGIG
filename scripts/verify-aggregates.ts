import "dotenv/config";
import { db } from "../src/lib/db";
import { loadBuilders } from "../src/lib/rank-data";
import { meanRating } from "../src/lib/rankers";
import { MAX_REVISION_COUNT, contractScopeSchema, splitPayment } from "../src/lib/domain";

/**
 * Aggregate consistency check.
 *
 * The Rankers board claims every published number is derived from database state. This
 * script proves it: it recomputes the same aggregates independently (through Postgres
 * itself, not through the ranking helper) and exits non-zero on any mismatch. Pattern
 * borrowed from stellarmarket-labs/stellar-market's `prisma:verify-review-aggregates`.
 *
 * Run with the local development database only: `npm run verify:aggregates`.
 */
const databaseUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
  throw new Error("Aggregate verification requires an explicitly configured local database");
}

const problems: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) problems.push(message); };
const round1 = (value: number) => Math.round(value * 10) / 10;
let reviewedStudents = 0;

try {
  const board = await loadBuilders();

  // 1. Published review aggregates must agree with the database engine's own aggregation.
  for (const builder of [...board.ranked, ...board.awaiting]) {
    const [aggregate, rows] = await Promise.all([
      db.review.aggregate({ where: { revieweeId: builder.id }, _count: { _all: true }, _avg: { rating: true } }),
      db.review.findMany({ where: { revieweeId: builder.id }, select: { rating: true } }),
    ]);
    const databaseCount = aggregate._count._all;
    const databaseAverage = aggregate._avg.rating;
    const helperAverage = meanRating(rows);
    if (databaseCount > 0) reviewedStudents += 1;
    check(builder.reviewCount === databaseCount, `${builder.name}: published review count ${builder.reviewCount} != ${databaseCount} from db.review.aggregate`);
    check(rows.length === databaseCount, `${builder.name}: db.review.aggregate counted ${databaseCount} rows but ${rows.length} were read`);
    if (databaseAverage === null || helperAverage === null) {
      check(databaseAverage === helperAverage, `${builder.name}: rating average is null on one side only (database ${databaseAverage}, helper ${helperAverage})`);
      check(builder.ratingAverage === null, `${builder.name}: published rating ${builder.ratingAverage} exists without review history`);
    } else {
      check(Math.abs(databaseAverage - helperAverage) < 1e-9, `${builder.name}: Postgres AVG ${databaseAverage} != JavaScript mean ${helperAverage}`);
      check(builder.ratingAverage === round1(helperAverage), `${builder.name}: published rating ${builder.ratingAverage} != ${round1(helperAverage)} recomputed from review rows`);
    }
    check(builder.score === null ? builder.reviewCount === 0 : builder.reviewCount > 0, `${builder.name}: index published for a builder with no reviews, or withheld despite reviews`);
  }
  const rankedCount = board.ranked.length;
  check(rankedCount === board.ranked.filter((builder) => builder.score !== null).length, "A ranked builder is missing its index");

  // 2. Every sandbox ledger row must have the shape the app produces for its type:
  //    escrow rows balance exactly, distributions never exceed the row amount, and a
  //    refund returns money without inventing a fee or a payout. Mirrors the
  //    Transaction_row_shape check constraint.
  for (const transaction of await db.transaction.findMany({ select: { id: true, type: true, amount: true, platformFee: true, studentPayout: true } })) {
    const split = transaction.platformFee + transaction.studentPayout;
    check(transaction.amount >= 0 && transaction.platformFee >= 0 && transaction.studentPayout >= 0,
      `Transaction ${transaction.id}: negative amount in the sandbox ledger`);
    check(split <= transaction.amount,
      `Transaction ${transaction.id}: platformFee ${transaction.platformFee} + studentPayout ${transaction.studentPayout} exceeds amount ${transaction.amount}`);
    if (transaction.type === "ESCROW_FUND") {
      check(split === transaction.amount,
        `Transaction ${transaction.id}: escrow distributes ${split} but holds ${transaction.amount}`);
    }
    if (transaction.type === "REFUND") {
      check(transaction.platformFee === 0 && transaction.studentPayout === 0,
        `Transaction ${transaction.id}: refund carries platformFee ${transaction.platformFee} and studentPayout ${transaction.studentPayout}`);
    }
  }

  // 3. Payout releases exist once, only after completion, and the agreed amount is split
  //    by the documented 5% rule. Ledger rows are per-type (a fee row carries the fee
  //    alone), so the rule is verified per contract through splitPayment rather than by
  //    re-deriving a fee percentage from the amount of every individual row.
  for (const contract of await db.contract.findMany({ select: { id: true, status: true, agreedAmount: true, transactions: { select: { type: true, amount: true, studentPayout: true } } } })) {
    const releases = contract.transactions.filter((transaction) => transaction.type === "PAYOUT_RELEASE");
    const escrows = contract.transactions.filter((transaction) => transaction.type === "ESCROW_FUND");
    const split = splitPayment(contract.agreedAmount);
    check(contract.status === "COMPLETED" ? releases.length === 1 : releases.length === 0,
      `Contract ${contract.id} is ${contract.status} with ${releases.length} payout release row(s)`);
    for (const release of releases) {
      check(release.studentPayout === split.studentPayout,
        `Contract ${contract.id}: released payout ${release.studentPayout} != ${split.studentPayout} from the documented 5% rule on ${contract.agreedAmount}`);
    }
    if (contract.status !== "COMPLETED") continue;
    check(escrows.length === 1, `Contract ${contract.id} is completed with ${escrows.length} escrow row(s)`);
    for (const escrow of escrows) {
      check(escrow.amount === contract.agreedAmount,
        `Contract ${contract.id}: escrow ${escrow.amount} != agreed amount ${contract.agreedAmount}`);
      check(escrow.studentPayout === split.studentPayout,
        `Contract ${contract.id}: escrowed payout ${escrow.studentPayout} != ${split.studentPayout} from the documented 5% rule`);
    }
  }

  // 4. Career evidence may only be attached to completed contracts.
  for (const row of await db.skillEvidence.findMany({ select: { id: true, contractId: true, contract: { select: { status: true } } } })) {
    check(row.contract.status === "COMPLETED", `SkillEvidence ${row.id} is attached to contract ${row.contractId} with status ${row.contract.status}`);
  }

  // 5. Reviews may only exist for completed contracts, and only from a contract participant.
  for (const review of await db.review.findMany({ select: { id: true, reviewerId: true, revieweeId: true, contract: { select: { status: true, clientId: true, studentId: true } } } })) {
    check(review.contract.status === "COMPLETED", `Review ${review.id} is attached to a contract with status ${review.contract.status}`);
    check([review.contract.clientId, review.contract.studentId].includes(review.reviewerId), `Review ${review.id} was written by a non-participant`);
    check([review.contract.clientId, review.contract.studentId].includes(review.revieweeId), `Review ${review.id} targets a non-participant`);
  }

  // 6. Every contract must carry a readable frozen scope, and the agreed amount must sit
  //    inside the budget that was frozen at the start. The Postgres CHECK constraints
  //    enforce the revision bound; this states the same rule in reviewable terms.
  for (const contract of await db.contract.findMany({ select: { id: true, agreedAmount: true, revisionCount: true, scopeSnapshot: true } })) {
    const parsed = contractScopeSchema.safeParse(contract.scopeSnapshot);
    if (!parsed.success) {
      problems.push(`Contract ${contract.id}: scope snapshot is missing or malformed`);
      continue;
    }
    const scope = parsed.data;
    check(scope.revisionAllowance === MAX_REVISION_COUNT,
      `Contract ${contract.id}: frozen allowance ${scope.revisionAllowance} != MAX_REVISION_COUNT ${MAX_REVISION_COUNT}`);
    check(contract.revisionCount <= MAX_REVISION_COUNT,
      `Contract ${contract.id}: ${contract.revisionCount} revisions used but only ${MAX_REVISION_COUNT} allowed`);
    check(scope.budgetMin <= contract.agreedAmount && contract.agreedAmount <= scope.budgetMax,
      `Contract ${contract.id}: agreed amount ${contract.agreedAmount} is outside the frozen budget ${scope.budgetMin}-${scope.budgetMax}`);
  }

  // 7. Revision usage must be re-derivable from submission history, so the counter can
  //    never drift away from what clients actually requested.
  for (const contract of await db.contract.findMany({ select: { id: true, revisionCount: true, submissions: { select: { status: true } } } })) {
    const requested = contract.submissions.filter((submission) => submission.status === "REVISION_REQUESTED").length;
    check(requested === contract.revisionCount,
      `Contract ${contract.id}: ${requested} revision-requested submission(s) but revisionCount is ${contract.revisionCount}`);
  }
} finally {
  await db.$disconnect();
}

if (problems.length) {
  console.error(`Aggregate mismatch found in ${problems.length} place(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`No aggregate mismatches found. ${reviewedStudents} reviewed student(s) verified against Postgres aggregation.`);
}
