import { describe, expect, it } from "vitest";
import { calculateMatch, type MatchInput } from "../../src/lib/matching";

const ideal: MatchInput = {
  requiredSkills: ["React", "TypeScript"], studentSkills: ["React", "TypeScript"],
  difficulty: "INTERMEDIATE", relevantPortfolioItems: 3, availableHours: 10, estimatedHours: 5,
  hoursUntilDeadline: 48, relevantCompletedTasks: 5, onTimeRate: 1, ratingAverage: 5,
  workModeCompatible: true,
};
const component = (input: MatchInput, key: string) => calculateMatch(input).breakdown.find((item) => item.key === key)!;

describe("explainable matching", () => {
  it("computes the seven spec-weighted components rather than a canned score", () => {
    const result = calculateMatch(ideal);
    expect(result.score).toBe(100);
    expect(result.breakdown.map((part) => part.weight)).toEqual([0.35, 0.2, 0.15, 0.1, 0.1, 0.05, 0.05]);
    expect(result.reasons).toEqual(result.breakdown.map((part) => part.reason));
    expect(calculateMatch({ ...ideal, studentSkills: [] }).score).toBe(65);
  });
  it("deduplicates skills case-insensitively without inflating overlap", () => {
    const input = { ...ideal, requiredSkills: [" React ", "react", "TypeScript"], studentSkills: ["react", "REACT"] };
    expect(component(input, "skill_match").value).toBe(50);
    expect(component({ ...ideal, requiredSkills: [] }, "skill_match").value).toBe(50);
  });
  it("uses a labeled neutral prior for unknown history instead of claiming quality", () => {
    const input = { ...ideal, onTimeRate: null, ratingAverage: null, relevantPortfolioItems: 0, relevantCompletedTasks: 0 };
    expect(component(input, "completion_rate").value).toBe(50);
    expect(component(input, "rating").value).toBe(50);
    expect(component(input, "rating").reason).toMatch(/unknown|no .*history/i);
    expect(component(input, "completion_rate").reason).toMatch(/unknown|no .*history/i);
    expect(calculateMatch(input).score).toBe(63);
  });
  it("caps availability by time remaining and gives impossible deadlines zero availability", () => {
    expect(component({ ...ideal, hoursUntilDeadline: 1 }, "availability").value).toBe(20);
    expect(component({ ...ideal, hoursUntilDeadline: 0 }, "availability").value).toBe(0);
    expect(component({ ...ideal, hoursUntilDeadline: -5 }, "availability").value).toBe(0);
    expect(component({ ...ideal, availableHours: 0 }, "availability").value).toBe(0);
    expect(component({ ...ideal, hoursUntilDeadline: 1 }, "availability").reason).toMatch(/deadline/i);
  });
  it("uses portfolio difficulty thresholds 1/2/3 and five completed tasks for experience", () => {
    expect(component({ ...ideal, difficulty: "ADVANCED", relevantPortfolioItems: 1 }, "portfolio_relevance").value)
      .toBeLessThan(component({ ...ideal, difficulty: "BEGINNER", relevantPortfolioItems: 1 }, "portfolio_relevance").value);
    expect(component({ ...ideal, relevantPortfolioItems: 2 }, "portfolio_relevance").value).toBe(100);
    expect(component({ ...ideal, difficulty: "ADVANCED", relevantPortfolioItems: 3 }, "portfolio_relevance").value).toBe(100);
    expect(component({ ...ideal, relevantCompletedTasks: 3 }, "past_task_relevance").value).toBe(60);
    expect(calculateMatch({ ...ideal, relevantPortfolioItems: 100, relevantCompletedTasks: 100 }).score).toBe(100);
    expect(component({ ...ideal, workModeCompatible: false }, "work_mode").value).toBe(0);
  });
  it.each([
    { availableHours: -1 }, { relevantPortfolioItems: -1 }, { relevantCompletedTasks: 1.5 },
    { estimatedHours: 0 }, { estimatedHours: Infinity }, { hoursUntilDeadline: NaN },
    { ratingAverage: 6 }, { onTimeRate: 1.1 }, { onTimeRate: -0.1 }, { ratingAverage: NaN },
    { difficulty: "EXPERT" }, { studentSkills: undefined }, { workModeCompatible: "yes" },
  ])("rejects malformed inputs %j", (patch) => {
    expect(() => calculateMatch({ ...ideal, ...patch } as MatchInput)).toThrow();
  });
});