import { describe, expect, it } from "vitest";
import { MAX_REVISION_COUNT, assertRevisionAllowed, assertRole, assertTransition, budgetSchema, buildContractScope, contractScopeSchema, moderateTask, nextContractStatus, splitPayment, taskInputSchema } from "../../src/lib/domain";

describe("sandbox payment split", () => {
  it("keeps integer paise and rounds the five percent fee once", () => {
    expect(splitPayment(300000)).toEqual({ amount: 300000, platformFee: 15000, studentPayout: 285000 });
    expect(splitPayment(10)).toEqual({ amount: 10, platformFee: 1, studentPayout: 9 });
    expect(splitPayment(9)).toEqual({ amount: 9, platformFee: 0, studentPayout: 9 });
    expect(splitPayment(0)).toEqual({ amount: 0, platformFee: 0, studentPayout: 0 });
  });
  it("preserves exact fee rounding and conservation at the safe integer boundary", () => {
    const result = splitPayment(Number.MAX_SAFE_INTEGER);
    expect(result.platformFee).toBe(450359962737050);
    expect(result.platformFee + result.studentPayout).toBe(result.amount);
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid paise %s", (amount) => {
    expect(() => splitPayment(amount)).toThrow();
  });
});

describe("contract lifecycle", () => {
  it("permits the complete workflow including a revision", () => {
    let status = nextContractStatus("PENDING", "START");
    expect(status).toBe("IN_PROGRESS");
    status = nextContractStatus(status, "SUBMIT");
    status = nextContractStatus(status, "REQUEST_REVISION");
    expect(status).toBe("REVISION_REQUESTED");
    status = nextContractStatus(status, "START");
    status = nextContractStatus(status, "SUBMIT");
    status = nextContractStatus(status, "APPROVE");
    expect(status).toBe("APPROVED");
    expect(nextContractStatus(status, "RELEASE_PAYMENT")).toBe("COMPLETED");
    expect(() => assertTransition("SUBMITTED", "APPROVE")).not.toThrow();
  });
  it.each([
    ["PENDING", "APPROVE"], ["IN_PROGRESS", "RELEASE_PAYMENT"],
    ["REVISION_REQUESTED", "SUBMIT"], ["COMPLETED", "RELEASE_PAYMENT"],
    ["CANCELLED", "START"], ["SUBMITTED", "SUBMIT"], ["UNKNOWN", "START"],
  ])("rejects %s -> %s", (status, event) => {
    expect(() => nextContractStatus(status as never, event as never)).toThrow(/transition/i);
  });
  it("limits cancellation and disputes to active contracts", () => {
    expect(nextContractStatus("PENDING", "CANCEL")).toBe("CANCELLED");
    expect(nextContractStatus("IN_PROGRESS", "DISPUTE")).toBe("DISPUTED");
    expect(() => nextContractStatus("APPROVED", "CANCEL")).toThrow();
    expect(() => nextContractStatus("COMPLETED", "DISPUTE")).toThrow();
  });
});

describe("revision allowance", () => {
  it("allows exactly one revision and then refuses", () => {
    expect(MAX_REVISION_COUNT).toBe(1);
    expect(() => assertRevisionAllowed(0)).not.toThrow();
    expect(() => assertRevisionAllowed(MAX_REVISION_COUNT)).toThrow(/revision limit/i);
    expect(() => assertRevisionAllowed(MAX_REVISION_COUNT + 5)).toThrow(/revision limit/i);
  });
  it.each([-1, 1.5, NaN, Infinity, "0"])("rejects an unusable revision count %s", (count) => {
    expect(() => assertRevisionAllowed(count as never)).toThrow();
  });
});

describe("contract scope snapshot", () => {
  const task = {
    id: "task-1", status: "ASSIGNED", aiSummary: "ignored", clientId: "client-1",
    title: "Design a club poster", description: "Create an original poster for the campus fest.",
    category: "Design", difficulty: "BEGINNER" as const, budgetMin: 10000, budgetMax: 20000,
    estimatedHours: 3, workMode: "REMOTE" as const, location: "Remote",
  };
  it("freezes the agreed brief and normalizes the required skills", () => {
    const scope = buildContractScope(task, [" Figma ", "figma", "React", "", "React"], new Date("2026-10-07T09:15:00.000Z"));
    expect(scope).toMatchObject({
      title: "Design a club poster", category: "Design", difficulty: "BEGINNER",
      budgetMin: 10000, budgetMax: 20000, estimatedHours: 3, workMode: "REMOTE",
      revisionAllowance: MAX_REVISION_COUNT, capturedAt: "2026-10-07T09:15:00.000Z",
    });
    expect(scope.requiredSkills).toEqual(["Figma", "React"]);
    expect(contractScopeSchema.parse(JSON.parse(JSON.stringify(scope)))).toEqual(scope);
  });
  it("cannot be rewritten by later edits to the live task", () => {
    const scope = buildContractScope(task, ["Figma"]);
    task.budgetMax = 999999; task.title = "Totally different brief"; task.estimatedHours = 99;
    expect(scope.budgetMax).toBe(20000);
    expect(scope.title).toBe("Design a club poster");
    expect(scope.estimatedHours).toBe(3);
  });
  it.each([
    { budgetMin: 20000, budgetMax: 10000 }, { title: "" }, { estimatedHours: 0 },
    { difficulty: "EXPERT" }, { workMode: "TELEPATHIC" }, { budgetMin: -1 },
  ])("rejects a brief that cannot be frozen %j", (patch) => {
    expect(contractScopeSchema.safeParse({ ...buildContractScope(task, ["Figma"]), ...patch }).success).toBe(false);
  });
});

it("checks roles without trusting unknown values", () => {
  expect(() => assertRole("CLIENT", ["CLIENT", "ADMIN"])).not.toThrow();
  expect(() => assertRole("STUDENT", ["CLIENT"])).toThrow(/role|forbidden/i);
  expect(() => assertRole("SUPERUSER" as never, ["SUPERUSER" as never])).toThrow();
});

describe("moderation", () => {
  it.each([
    "Do my graded assignment and submit it as me", "Write my essay for submission",
    "Write my graded assignment", "Solve my exam for me", "Complete another student's graded homework",
    "Take my exam for me", "Sell stolen passwords", "Build credential theft malware",
    "Sell illegal drugs", "Help with financial fraud", "Pay outside the platform",
  ])("blocks prohibited work: %s", (text) => {
    expect(moderateTask(text).allowed).toBe(false);
    expect(moderateTask(text).reasons.length).toBeGreaterThan(0);
  });
  it.each([
    "Tutor me in calculus for my exam", "Proofread and format my research paper",
    "Research assistance for a faculty literature review", "Design a poster about drug prevention",
    "Help me understand my assignment, do not do it for me", "Write documentation for malware detection software",
    "Tutor me; do not do my graded assignment for me",
  ])("allows legitimate assistance: %s", (text) => {
    expect(moderateTask(text)).toEqual({ allowed: true, reasons: [] });
  });
  it("rejects missing content", () => expect(moderateTask(" ").allowed).toBe(false));
});

describe("task validation", () => {
  const valid = {
    title: "Design a club poster", description: "Create an original poster for our upcoming campus event.",
    category: "Design", difficulty: "BEGINNER", requiredSkills: [" Figma ", "figma"],
    estimatedHours: 3, budgetMin: 10000, budgetMax: 20000,
    deadline: "2099-01-01T12:00:00.000Z", workMode: "REMOTE", deliverables: ["Poster PDF"],
  };
  it("validates budgets and normalizes skills", () => {
    expect(taskInputSchema.parse(valid).requiredSkills).toEqual(["Figma"]);
    expect(budgetSchema.safeParse({ budgetMin: 20000, budgetMax: 10000 }).success).toBe(false);
  });
  it.each([
    { budgetMin: -1 }, { budgetMax: Infinity }, { budgetMin: 1.5 },
    { title: "" }, { description: "" }, { estimatedHours: NaN }, { estimatedHours: 0 },
    { deadline: "2000-01-01" }, { deadline: "not a date" }, { difficulty: "EXPERT" },
  ])("rejects invalid task fields %j", (patch) => {
    expect(taskInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});