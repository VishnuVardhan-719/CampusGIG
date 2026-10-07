import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTask } from "../../src/lib/ai";

beforeEach(() => {
  vi.stubEnv("AI_BASE_URL", "");
  vi.stubEnv("AI_API_KEY", "");
  vi.stubEnv("AI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const enableAI = () => {
  vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
  vi.stubEnv("AI_API_KEY", "test-key");
  vi.stubEnv("AI_MODEL", "test-model");
};
const analysis = {
  title: "Build a React landing page", summary: "Create a responsive product landing page.", category: "Development",
  difficulty: "INTERMEDIATE", requiredSkills: ["React"], estimatedHours: 5,
  deliverables: ["Source code", "Live preview"], warnings: [],
};
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

describe("task analysis", () => {
  it("uses deterministic, explicitly labeled fallback without AI credentials", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const text = "Design a Figma poster for our college club";
    const result = await analyzeTask(text);
    expect(result).toEqual(await analyzeTask(text));
    expect(result.source).toBe("fallback");
    expect(result.category).toBe("Design");
    expect(result.requiredSkills).toContain("Figma");
    expect(result.warnings.join(" ")).toMatch(/fallback|AI.*unavailable/i);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses neutral fallback for missing information and flags prohibited requests", async () => {
    const empty = await analyzeTask("");
    expect(empty.source).toBe("fallback");
    expect(empty.requiredSkills).toEqual([]);
    expect(empty.warnings.join(" ")).toMatch(/details|scope/i);
    const cheating = await analyzeTask("Do my graded assignment and submit it as me");
    expect(cheating.warnings.join(" ")).toMatch(/academic|cheating/i);
  });
  it("validates structured provider output and identifies its source", async () => {
    enableAI();
    const fetch = vi.fn().mockResolvedValue(response(analysis));
    vi.stubGlobal("fetch", fetch);
    expect(await analyzeTask("Build a React landing page")).toEqual({ ...analysis, source: "ai" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(options.body).model).toBe("test-model");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("retries a transient failure once and can recover", async () => {
    enableAI();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(response(analysis));
    vi.stubGlobal("fetch", fetch);
    expect((await analyzeTask("Build a React landing page")).source).toBe("ai");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...analysis, estimatedHours: -1 }, { ...analysis, difficulty: "EXPERT" },
    { ...analysis, requiredSkills: "React" }, { title: "Partial result" },
  ])("rejects malformed AI data and falls back after one retry", async (invalid) => {
    enableAI();
    const fetch = vi.fn().mockImplementation(async () => response(invalid));
    vi.stubGlobal("fetch", fetch);
    expect((await analyzeTask("Build a React landing page")).source).toBe("fallback");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("falls back on non-OK HTTP responses without leaking provider details", async () => {
    enableAI();
    const fetch = vi.fn().mockResolvedValue(new Response("secret provider detail", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const result = await analyzeTask("Design a poster");
    expect(result.source).toBe("fallback");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });
  it("bounds each request by a timeout then retries only once", async () => {
    enableAI();
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const result = analyzeTask("Design a poster");
    await vi.advanceTimersByTimeAsync(16000);
    expect((await result).source).toBe("fallback");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});