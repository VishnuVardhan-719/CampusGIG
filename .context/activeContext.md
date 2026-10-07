# Active Context — Kilo Setup Boost (2026-10-03)

## DONE (verified)
1. **kilo.jsonc providers trimmed to 6 working**: xkiro (3), openrouter (5), anymodel (2), tokenharbor (3), apmix (1), clixad (9). All models end-to-end tested via real chat calls (earlier in session — PASS on all listed).
2. **clixad provider added**: baseURL `https://clixad.onrender.com/v1`, OpenAI-compatible, token `adg_4360...` in kilo.jsonc. Verified chat works, balance ~35,000 credits.
3. **MCP servers added to kilo.jsonc**: context7 (remote), obsidian, playwright, chrome-devtools, sequential-thinking, memory, stitch — all enabled. Backup: `kilo.jsonc.bak-before-mcp`.
4. **11 slash commands copied** from `~/.claude/commands/` → `~/.config/kilo/command/` (build-app, understand, fix-build, scrape, analyze-data, hackathon-mode, review, squad, context-check, handoff, resume).
5. **rtk v0.51.0** at `~/.local/bin/rtk.exe`, 22.4% token savings confirmed. **opencode-kcp-plugin** installed globally (`kilo plugin opencode-kcp-plugin -g`), cached `~/.cache/kilo/packages/`. `~/.kilocode/rules/boost.md` added.
6. **auth.json cleaned**: removed dead providers (orcarouter — 404 on all chat endpoints; hcnsec, space, bai, b-ai, conduit). Fixed corrupted openrouter key (stray spaces). Backup: `auth.json.bak-2026-10-03`.
7. **Default model → `clixad/claude-sonnet-5.5`** (verified, ~10 credits/call). APMix `claude-sonnet-4-6-free` works but rate-limit 429 sometimes.
8. **Auto-approve enabled**: `permission` in kilo.jsonc = `"*": {"*": "allow"}` + `bash: allow`. Config validated.
9. **KCP plugin REINSTALLED cleanly** (cache was corrupt/missing entry file). Now cached complete at ~/.cache/kilo/packages/opencode-kcp-plugin@latest (v0.1.0, nested at node_modules/opencode-kcp-plugin). **BRUTAL FINDING**: v0.1.0 is a NO-OP without a project `knowledge.yaml` — it only annotates glob/grep if that file exists. It does NOT inject the 289 CLI manifests the marketing claims. Keeping it costs nothing but does nothing today.
10. **Weekly free-model refresh script DONE**: `~/.config/kilo/update-free-models.ps1` (report-only by default; `-Schedule` registers task). Scheduled task `KiloFreeModelsWeekly` registered (Ready, Monday 09:00). Report at `~/.config/kilo/free-models-report.json`. Found new free models NOT in config: nemotron-3.5-lightning (1M ctx), nemotron-3-ultra (1M ctx), thinkingmachines/inkling (1M ctx), qwen3.8-27b, poolside laguna-s-2.1 — worth adding to openrouter models.

## TODO / PENDING
1. ~~Verify opencode-kcp-plugin~~ → RESOLVED: it's a no-op without knowledge.yaml. Optional: create knowledge.yaml per project to make it useful, or drop it.
2. ~~Weekly free-model refresh~~ → DONE (script + scheduled task). Optionally add the newly found free models (nemotron-3.5-lightning etc.) to kilo.jsonc openrouter block.
3. Boost repos searched but NOT installed (user said search only): ECC (affaan-m/ECC), KILO-KIT (VoDaiLocz/KILO-KIT), handoff-mcp (kirill-sviridov). Ask before installing.
3. Boost repos searched but NOT installed (user said search only): ECC (affaan-m/ECC), KILO-KIT (VoDaiLocz/KILO-KIT), handoff-mcp (kirill-sviridov). Ask before installing.
4. Screenshot "this is lame / premium styling" — model can't read images. Need user to DESCRIBE what to redesign (TUI theme? statusline? page?).

## RULES
- Never commit/push unless asked.
- Verify with real test output (never claim done without proof).
- rtk prefix on shell commands.
- Windows + PowerShell. Secrets stay in config files.