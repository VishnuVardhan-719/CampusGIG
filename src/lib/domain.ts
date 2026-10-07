import { z } from "zod";

export type Role = "STUDENT" | "CLIENT" | "ADMIN";
export type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type ContractStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REVISION_REQUESTED" | "APPROVED" | "COMPLETED" | "CANCELLED" | "DISPUTED";
export type ContractEvent = "START" | "SUBMIT" | "REQUEST_REVISION" | "APPROVE" | "RELEASE_PAYMENT" | "CANCEL" | "DISPUTE";

export function isVerifiedWork(contract: { status: string } | null): boolean {
  return contract?.status === "COMPLETED";
}

export function splitPayment(amountPaise: number): { amount: number; platformFee: number; studentPayout: number } {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error("Amount must be non-negative integer paise");
  const platformFee = Number((BigInt(amountPaise) + 10n) / 20n);
  return { amount: amountPaise, platformFee, studentPayout: amountPaise - platformFee };
}

const transitions: Record<ContractStatus, Partial<Record<ContractEvent, ContractStatus>>> = {
  PENDING: { START: "IN_PROGRESS", CANCEL: "CANCELLED" },
  IN_PROGRESS: { SUBMIT: "SUBMITTED", CANCEL: "CANCELLED", DISPUTE: "DISPUTED" },
  SUBMITTED: { REQUEST_REVISION: "REVISION_REQUESTED", APPROVE: "APPROVED", DISPUTE: "DISPUTED" },
  REVISION_REQUESTED: { START: "IN_PROGRESS", CANCEL: "CANCELLED", DISPUTE: "DISPUTED" },
  APPROVED: { RELEASE_PAYMENT: "COMPLETED", DISPUTE: "DISPUTED" },
  COMPLETED: {}, CANCELLED: {}, DISPUTED: {},
};

export function nextContractStatus(current: ContractStatus, event: ContractEvent): ContractStatus {
  const next = Object.hasOwn(transitions, current) && Object.hasOwn(transitions[current], event) ? transitions[current][event] : undefined;
  if (!next) throw new Error(`Illegal contract transition: ${current} / ${event}`);
  return next;
}

export function assertTransition(current: ContractStatus, event: ContractEvent): void {
  nextContractStatus(current, event);
}

export function assertRole(role: string, allowed: readonly Role[]): void {
  if (!["STUDENT", "CLIENT", "ADMIN"].includes(role) || !allowed.includes(role as Role)) throw new Error("Forbidden role");
}

// One revision per contract. Changing this requires the matching database check
// constraint from the contract_scope_and_revision_limit migration to change too.
export const MAX_REVISION_COUNT = 1;

export function assertRevisionAllowed(revisionCount: number): void {
  const used = z.number().int().nonnegative().parse(revisionCount);
  if (used >= MAX_REVISION_COUNT) {
    throw new Error(`Revision limit reached: this contract allows ${MAX_REVISION_COUNT === 1 ? "one revision" : `${MAX_REVISION_COUNT} revisions`} and the allowance is used. Approve the work or open a dispute.`);
  }
}

const scopeTaskSchema = z.object({
  title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(1).max(80), difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  budgetMin: z.number().int().nonnegative(), budgetMax: z.number().int().nonnegative(),
  estimatedHours: z.number().int().positive(), workMode: z.enum(["REMOTE", "ONSITE", "HYBRID"]),
  location: z.string().trim().max(120),
});
export const contractScopeSchema = scopeTaskSchema.extend({
  requiredSkills: z.array(z.string().trim().min(1).max(80)),
  revisionAllowance: z.number().int().nonnegative(), capturedAt: z.string().trim().min(1),
}).refine((value) => value.budgetMax >= value.budgetMin, { message: "Maximum budget must be at least minimum budget", path: ["budgetMax"] });
export type ContractScope = z.infer<typeof contractScopeSchema>;

// Scope lock: freeze the agreed brief when the contract is created, so a changed
// task page can never silently rewrite what the student agreed to deliver.
// Parsing copies the values, so the snapshot cannot alias the live task record.
export function buildContractScope(
  task: z.input<typeof scopeTaskSchema>, requiredSkills: readonly string[], capturedAt: Date = new Date(),
): ContractScope {
  const parsed = scopeTaskSchema.parse(task);
  // Same lowercased de-duplication the matcher uses, so "Figma" and "figma" cannot
  // appear twice in one frozen scope. Canonical slugs remain a known limitation.
  const seen = new Set<string>();
  const skills = requiredSkills.map((skill) => skill.trim()).filter(Boolean).filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return contractScopeSchema.parse({
    ...parsed, requiredSkills: skills.sort((a, b) => a.localeCompare(b)),
    revisionAllowance: MAX_REVISION_COUNT, capturedAt: capturedAt.toISOString(),
  });
}

export function moderateTask(text: string): { allowed: boolean; reasons: string[] } {
  if (typeof text !== "string" || !text.trim()) return { allowed: false, reasons: ["Task details are required"] };
  const normalized = text.toLowerCase().replace(/[’‘]/g, "'");
  const rules: [RegExp, string][] = [
    [/(?<!do not )(?<!don't )\b(?:do|complete|solve|write)\s+(?:my|someone else's|another student's)\s+(?:graded\s+)?(?:assignment|homework)\b|\bwrite\s+(?:my|someone else's)\s+(?:essay|dissertation|thesis)\s+for\s+submission\b|\bsubmit\b.{0,60}\b(?:as me|on behalf of another student)\b/i, "Academic cheating is prohibited; tutoring and proofreading are allowed"],
    [/\b(?:take|sit|complete|solve)\s+(?:my|someone else's)\s+exam\b|\bexam cheating\b/i, "Exam cheating and impersonation are prohibited"],
    [/\b(?:steal|stolen|sell stolen)\s+(?:passwords?|credentials?)\b|\bcredential theft\b|\b(?:create|build|deploy)\s+(?:a\s+)?(?:malware|ransomware|keylogger)\b/i, "Credential theft and malicious software are prohibited"],
    [/\b(?:sell|buy|supply|traffic)\s+(?:illegal\s+)?(?:drugs|cocaine|heroin|weapons|guns)\b/i, "Illegal goods and weapons are prohibited"],
    [/\bfinancial fraud\b|\b(?:launder|laundering)\s+money\b/i, "Financial fraud is prohibited"],
    [/\b(?:sexual services|paid sex|impersonate another person)\b/i, "Sexual services and impersonation are prohibited"],
    [/\b(?:pay|payment|transfer)\s+(?:me\s+)?(?:outside|off)\s+(?:the\s+)?platform\b|\bsend\s+(?:your\s+)?(?:otp|bank pin)\b/i, "Off-platform payments and sensitive payment requests are prohibited"],
  ];
  const reasons = rules.filter(([pattern]) => pattern.test(normalized)).map(([, reason]) => reason);
  return { allowed: reasons.length === 0, reasons };
}

const paise = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const budgetSchema = z.object({ budgetMin: paise, budgetMax: paise }).refine(
  (value) => value.budgetMax >= value.budgetMin, { message: "Maximum budget must be at least minimum budget", path: ["budgetMax"] },
);
const skillList = z.array(z.string().trim().min(1).max(80)).max(30).transform((skills) =>
  skills.filter((skill, index) => skills.findIndex((other) => other.toLowerCase() === skill.toLowerCase()) === index),
);
export const taskInputSchema = z.object({
  title: z.string().trim().min(5).max(160), description: z.string().trim().min(20).max(10000),
  category: z.string().trim().min(1).max(80), difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  requiredSkills: skillList, estimatedHours: z.number().positive().max(1000),
  budgetMin: paise, budgetMax: paise,
  deadline: z.union([z.string(), z.date()]).transform((value) => new Date(value)).refine(
    (value) => Number.isFinite(value.getTime()) && value.getTime() > Date.now(), { message: "Deadline must be in the future" },
  ),
  workMode: z.enum(["REMOTE", "ONSITE", "HYBRID"]),
  deliverables: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
}).refine((value) => value.budgetMax >= value.budgetMin, { message: "Maximum budget must be at least minimum budget", path: ["budgetMax"] });
export type TaskInput = z.infer<typeof taskInputSchema>;