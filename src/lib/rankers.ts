import { z } from "zod";

/**
 * Builder ranking ("rankers") engine.
 *
 * Code calculates; the UI only renders. Every component is derived from observed
 * platform records — client reviews on completed contracts, completed contracts,
 * and contract-backed skill evidence. Nothing here is model-generated, and a
 * builder with no reviews is never scored: unknown history stays unknown.
 */

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  timelinessRating: z.number().int().min(1).max(5),
});

const builderInputSchema = z.object({
  completedContracts: z.number().int().nonnegative(),
  onTimeContracts: z.number().int().nonnegative(),
  reviews: z.array(reviewSchema).max(1000),
  evidencedSkills: z.number().int().nonnegative(),
  verified: z.boolean(),
}).refine((value) => value.onTimeContracts <= value.completedContracts, {
  message: "On-time contracts cannot exceed completed contracts",
  path: ["onTimeContracts"],
});

export type BuilderInput = z.infer<typeof builderInputSchema>;
export type BuilderComponentKey = "client_rating" | "on_time" | "completed_work" | "skill_evidence" | "identity";

export type BuilderComponent = {
  key: BuilderComponentKey;
  label: string;
  /** 0–100, or null when the platform has not observed this signal yet. Null is never treated as zero. */
  value: number | null;
  weight: number;
  reason: string;
};

export type BuilderScore = {
  /** 0–100, or null for a builder with no review history (listed as awaiting a first review). */
  score: number | null;
  ranked: boolean;
  reviewCount: number;
  breakdown: BuilderComponent[];
};

export const COMPLETED_WORK_CEILING = 8;
export const SKILL_EVIDENCE_CEILING = 5;

/**
 * Single source of truth for the published weights and labels. The page legend and
 * the engine read the same list, so the displayed explanation cannot drift from the maths.
 */
export const BUILDER_COMPONENTS: readonly { key: BuilderComponentKey; label: string; weight: number; description: string }[] = [
  { key: "client_rating", label: "Client rating", weight: 0.3, description: `Mean rating from reviews on completed contracts.` },
  { key: "on_time", label: "On-time delivery", weight: 0.2, description: `Completed contracts delivered by their deadline.` },
  { key: "completed_work", label: "Completed contracts", weight: 0.2, description: `Platform contracts finished and approved, capped at ${COMPLETED_WORK_CEILING}.` },
  { key: "skill_evidence", label: "Work-backed skills", weight: 0.2, description: `Distinct skills with evidence rows from completed contracts, capped at ${SKILL_EVIDENCE_CEILING}.` },
  { key: "identity", label: "Identity status", weight: 0.1, description: `Whether the account holds the platform's verified status. Not an institution certificate.` },
];

const round1 = (value: number) => Math.round(value * 10) / 10;
const percentage = (value: number) => Math.min(100, Math.max(0, value * 100));

export function meanRating(reviews: readonly { rating: number }[]): number | null {
  if (!reviews.length) return null;
  return reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
}

export function buildBuilderScore(rawInput: BuilderInput): BuilderScore {
  const input = builderInputSchema.parse(rawInput);
  const reviewCount = input.reviews.length;
  const ratingAverage = meanRating(input.reviews);
  const ranked = reviewCount > 0;
  const onTimeRate = input.completedContracts > 0 ? input.onTimeContracts / input.completedContracts : null;
  const values: Record<BuilderComponentKey, { value: number | null; reason: string }> = {
    client_rating: ratingAverage === null
      ? { value: null, reason: "No completed review history yet; the rating component is not scored, so this builder is listed as awaiting a first review rather than ranked." }
      : { value: percentage(ratingAverage / 5), reason: `${reviewCount} review${reviewCount === 1 ? "" : "s"} on completed contracts, averaging ${round1(ratingAverage)} out of 5.` },
    on_time: onTimeRate === null
      ? { value: null, reason: "No completed contracts yet; delivery reliability is unknown, not zero." }
      : { value: percentage(onTimeRate), reason: `${input.onTimeContracts} of ${input.completedContracts} completed contracts met their deadline (${Math.round(onTimeRate * 100)}% observed).` },
    completed_work: { value: percentage(input.completedContracts / COMPLETED_WORK_CEILING), reason: `${input.completedContracts} completed contract${input.completedContracts === 1 ? "" : "s"}; ${COMPLETED_WORK_CEILING} reach this ceiling.` },
    skill_evidence: { value: percentage(input.evidencedSkills / SKILL_EVIDENCE_CEILING), reason: `${input.evidencedSkills} skill${input.evidencedSkills === 1 ? "" : "s"} carry evidence from completed contracts; ${SKILL_EVIDENCE_CEILING} reach this ceiling. Evidence records in-platform work, not an external certificate.` },
    identity: input.verified
      ? { value: 100, reason: "Account holds the platform's verified status." }
      : { value: 0, reason: "Account does not hold the platform's verified status; this is a status field, not a judgement of the work." },
  };
  const breakdown: BuilderComponent[] = BUILDER_COMPONENTS.map((component) => ({
    key: component.key, label: component.label, weight: component.weight, ...values[component.key],
  }));
  // Components the platform has not observed are excluded and the remaining weights are
  // renormalised, so an unobserved signal can never silently count as a zero.
  const observed = breakdown.filter((component): component is BuilderComponent & { value: number } => component.value !== null);
  const observedWeight = observed.reduce((total, component) => total + component.weight, 0);
  const score = ranked && observedWeight > 0
    ? Math.round(observed.reduce((total, component) => total + component.value * component.weight, 0) / observedWeight)
    : null;
  return { score, ranked, reviewCount, breakdown };
}

export type RankableSummary = {
  score: number | null;
  reviewCount: number;
  completedContracts: number;
  name: string;
  id: string;
};

/**
 * Deterministic ordering: score first, then review volume, then completed work, then a
 * stable name/id tie-break so the rendered order never depends on query or row order.
 * Builders without a score are always listed after scored builders.
 */
export function compareBuilders(a: RankableSummary, b: RankableSummary): number {
  if (a.score === null && b.score !== null) return 1;
  if (b.score === null && a.score !== null) return -1;
  if (a.score !== null && b.score !== null && a.score !== b.score) return b.score - a.score;
  if (a.reviewCount !== b.reviewCount) return b.reviewCount - a.reviewCount;
  if (a.completedContracts !== b.completedContracts) return b.completedContracts - a.completedContracts;
  const byName = a.name.localeCompare(b.name, "en");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id, "en");
}
