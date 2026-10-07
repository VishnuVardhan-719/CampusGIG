export type AiProvider = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  note: string;
};

export const AI_PROVIDER_CATALOG: Record<string, AiProvider> = {
  apmix: {
    id: "apmix",
    name: "ApMix",
    baseUrl: "https://api.apmix.ai/v1",
    defaultModel: "claude-sonnet-4-6-free",
    note: "Verified 2026-10-03: only model exposed by this key is claude-sonnet-4-6-free.",
  },
  clixad: {
    id: "clixad",
    name: "Clixad",
    baseUrl: "https://clixad.onrender.com/v1",
    defaultModel: "gemini-2.5-flash-lite",
    note: "Verified 2026-10-07: free-tier models only; premium models return 402 premium_locked.",
  },
};

export function resolveAiProvider(id: string): AiProvider | undefined {
  return AI_PROVIDER_CATALOG[id];
}