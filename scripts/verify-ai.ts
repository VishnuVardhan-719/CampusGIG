import "dotenv/config";
import { analyzeTask } from "../src/lib/ai";

const sample =
  process.argv[2] ??
  "Design a WhatsApp sticker pack and Instagram carousel for our college literary fest, 6 slides, deadline Friday evening.";

const result = await analyzeTask(sample);
console.log(JSON.stringify({ source: result.source, category: result.category, difficulty: result.difficulty, skills: result.requiredSkills, hours: result.estimatedHours }, null, 2));
if (result.source !== "ai") {
  console.error("LIVE AI NOT REACHED - fallback was used");
  process.exit(1);
}
console.log("LIVE AI VERIFIED");
