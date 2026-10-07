import { describe, expect, it } from "vitest";
import { BUILDER_COMPONENTS, buildBuilderScore, compareBuilders, meanRating, type BuilderInput, type RankableSummary } from "../../src/lib/rankers";

const review = (rating: number, timelinessRating = 5) => ({ rating, timelinessRating });
const input = (patch: Partial<BuilderInput> = {}): BuilderInput => ({
  completedContracts: 1, onTimeContracts: 1, reviews: [review(5)], evidencedSkills: 1, verified: true, ...patch,
});
const component = (value: BuilderInput, key: string) => buildBuilderScore(value).breakdown.find((part) => part.key === key)!;

describe("builder ranking", () => {
  it("publishes a single weighted list whose weights total 100% and match the rendered breakdown", () => {
    expect(BUILDER_COMPONENTS.map((part) => part.weight)).toEqual([0.3, 0.2, 0.2, 0.2, 0.1]);
    expect(BUILDER_COMPONENTS.reduce((total, part) => total + part.weight, 0)).toBeCloseTo(1, 10);
    const result = buildBuilderScore(input({ completedContracts: 8, onTimeContracts: 8, reviews: [review(5), review(5)], evidencedSkills: 9, verified: true }));
    expect(result.score).toBe(100);
    expect(result.breakdown.map((part) => [part.key, part.value])).toEqual([
      ["client_rating", 100], ["on_time", 100], ["completed_work", 100], ["skill_evidence", 100], ["identity", 100],
    ]);
    expect(result.breakdown.map((part) => part.weight)).toEqual(BUILDER_COMPONENTS.map((part) => part.weight));
  });

  it("never scores a builder without reviews, and never presents unknown history as zero", () => {
    const result = buildBuilderScore(input({ reviews: [], completedContracts: 0, onTimeContracts: 0, evidencedSkills: 0, verified: false }));
    expect(result.ranked).toBe(false);
    expect(result.score).toBeNull();
    expect(result.reviewCount).toBe(0);
    expect(component(input({ reviews: [] }), "client_rating").value).toBeNull();
    expect(component(input({ reviews: [] }), "client_rating").reason).toMatch(/awaiting a first review/i);
    expect(component(input({ completedContracts: 0, onTimeContracts: 0 }), "on_time").value).toBeNull();
    expect(component(input({ completedContracts: 0, onTimeContracts: 0 }), "on_time").reason).toMatch(/unknown, not zero/i);
  });

  it("excludes unobserved components and renormalises instead of counting them as zero", () => {
    const result = buildBuilderScore(input({ completedContracts: 0, onTimeContracts: 0, evidencedSkills: 0, verified: false }));
    // rating 100 (0.3), completed 0 (0.2), evidence 0 (0.2), identity 0 (0.1) over an observed weight of 0.8
    expect(result.score).toBe(38);
    expect(result.breakdown.find((part) => part.key === "on_time")!.value).toBeNull();
  });

  it("computes every component from raw counts and stays inside 0–100", () => {
    const result = buildBuilderScore(input({ completedContracts: 2, onTimeContracts: 1, reviews: [review(5), review(4)], evidencedSkills: 1, verified: false }));
    expect(component(input({ reviews: [review(5), review(4)] }), "client_rating").value).toBe(90);
    expect(component(input({ completedContracts: 2, onTimeContracts: 1 }), "on_time").value).toBe(50);
    expect(component(input({ completedContracts: 2 }), "completed_work").value).toBe(25);
    expect(component(input({ evidencedSkills: 1 }), "skill_evidence").value).toBe(20);
    expect(component(input({ verified: false }), "identity").value).toBe(0);
    // 27 (rating) + 10 (on-time) + 5 (completed) + 4 (evidence) + 0 (identity) = 46
    expect(result.score).toBe(46);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result.score)).toBe(true);
    expect(meanRating([review(4), review(5)])).toBe(4.5);
    expect(meanRating([])).toBeNull();
  });

  it.each([
    { completedContracts: -1 }, { onTimeContracts: -1 }, { onTimeContracts: 2 }, { completedContracts: 1.5 },
    { evidencedSkills: -1 }, { evidencedSkills: 0.5 }, { reviews: [{ rating: 6, timelinessRating: 5 }] },
    { reviews: [{ rating: 0, timelinessRating: 5 }] }, { reviews: [{ rating: 5, timelinessRating: 6 }] },
    { reviews: [{ rating: 5 }] }, { verified: "yes" }, { reviews: undefined }, { reviews: [{ rating: NaN, timelinessRating: 5 }] },
  ])("rejects malformed input %j", (patch) => {
    expect(() => buildBuilderScore({ ...input(), ...patch } as BuilderInput)).toThrow();
  });

  it("orders deterministically with builders lacking a score last", () => {
    const row = (patch: Partial<RankableSummary>): RankableSummary => ({ score: 80, reviewCount: 1, completedContracts: 1, name: "Ada", id: "a", ...patch });
    const rows: RankableSummary[] = [
      row({ score: null, name: "Unreviewed", id: "u" }),
      row({ score: 80, reviewCount: 1, name: "Fewer reviews", id: "f" }),
      row({ score: 80, reviewCount: 3, name: "More reviews", id: "m" }),
      row({ score: 91, reviewCount: 1, name: "Highest", id: "h" }),
      row({ score: 80, reviewCount: 3, completedContracts: 5, name: "More projects", id: "p" }),
    ];
    expect([...rows].sort(compareBuilders).map((entry) => entry.id)).toEqual(["h", "p", "m", "f", "u"]);
    // Stable and order-independent: sorting the reversed list gives the same result.
    expect([...rows].reverse().sort(compareBuilders).map((entry) => entry.id)).toEqual(["h", "p", "m", "f", "u"]);
  });
});
