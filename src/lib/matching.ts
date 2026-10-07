import { z } from "zod";

const matchInputSchema = z.object({
  requiredSkills: z.array(z.string()), studentSkills: z.array(z.string()),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  relevantPortfolioItems: z.number().int().nonnegative(), relevantCompletedTasks: z.number().int().nonnegative(),
  availableHours: z.number().nonnegative(), estimatedHours: z.number().positive(), hoursUntilDeadline: z.number(),
  onTimeRate: z.number().min(0).max(1).nullable(), ratingAverage: z.number().min(0).max(5).nullable(),
  workModeCompatible: z.boolean(),
});
export type MatchInput = z.infer<typeof matchInputSchema>;
export type MatchResult = {
  score: number;
  breakdown: { key: string; label: string; value: number; weight: number; reason: string }[];
  reasons: string[];
};

export function calculateMatch(rawInput: MatchInput): MatchResult {
  const input = matchInputSchema.parse(rawInput);
  const normalize = (skills: string[]) => new Set(skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean));
  const required = normalize(input.requiredSkills);
  const student = normalize(input.studentSkills);
  const overlap = [...required].filter((skill) => student.has(skill)).length;
  const evidenceTarget = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 }[input.difficulty];
  const effectiveHours = Math.min(input.availableHours, Math.max(0, input.hoursUntilDeadline));
  const percentage = (value: number) => Math.min(100, Math.max(0, value * 100));
  const breakdown = [
    { key: "skill_match", label: "Skill compatibility", value: required.size ? percentage(overlap / required.size) : 50, weight: 0.35,
      reason: required.size ? `${overlap} of ${required.size} distinct required skills match; claimed skills are not certification.` : "Required skills unknown; neutral prior of 50 used." },
    { key: "portfolio_relevance", label: "Relevant portfolio", value: percentage(input.relevantPortfolioItems / evidenceTarget), weight: 0.2,
      reason: `${input.relevantPortfolioItems} relevant portfolio items; ${evidenceTarget} reach the ${input.difficulty.toLowerCase()} evidence threshold.` },
    { key: "availability", label: "Availability", value: percentage(effectiveHours / input.estimatedHours), weight: 0.15,
      reason: `${effectiveHours} usable hours for ${input.estimatedHours} estimated hours, capped by the deadline (${Math.max(0, input.hoursUntilDeadline)} hours remaining).` },
    { key: "past_task_relevance", label: "Relevant completed work", value: percentage(input.relevantCompletedTasks / 5), weight: 0.1,
      reason: `${input.relevantCompletedTasks} relevant completed tasks; five reach the experience threshold.` },
    { key: "completion_rate", label: "On-time delivery", value: input.onTimeRate === null ? 50 : percentage(input.onTimeRate), weight: 0.1,
      reason: input.onTimeRate === null ? "On-time history unknown; neutral prior of 50 used, not an observed delivery rate." : `${Math.round(input.onTimeRate * 100)}% observed on-time delivery; used as the delivery-reliability component.` },
    { key: "rating", label: "Client rating", value: input.ratingAverage === null ? 50 : percentage(input.ratingAverage / 5), weight: 0.05,
      reason: input.ratingAverage === null ? "Client rating unknown; neutral prior of 50 used, not an observed rating." : `${input.ratingAverage} out of 5 average client rating.` },
    { key: "work_mode", label: "Work mode compatibility", value: input.workModeCompatible ? 100 : 0, weight: 0.05,
      reason: input.workModeCompatible ? "Student and task work modes are compatible." : "Student and task work modes are not compatible." },
  ];
  return { score: Math.round(breakdown.reduce((sum, part) => sum + part.value * part.weight, 0)), breakdown, reasons: breakdown.map((part) => part.reason) };
}