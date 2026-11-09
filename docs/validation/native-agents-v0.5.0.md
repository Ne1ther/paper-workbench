# Native-agent acceptance: v0.5.0

Accepted on 2026-11-09 using Codex CLI/app-server 0.167.0 on macOS. Both installed standalone TOML profiles were discovered and invoked as native roles. No role aliases or global configuration changes were used.

## Evidence

The confirmation run used the normal persisted-session path with default parent-history inheritance. Its parent and both child sessions were archived after completion. The parent inherited the existing `gpt-6.1-sol`, `xhigh`, and `priority` settings; neither role specifies a model override.

- The actual parent rollout contains `spawn_agent` calls with `agent_type` equal to `paper-analyst-agent` and `paper-review-agent`.
- Before shutdown, `thread/read` returned those exact values in each child's `agentRole` and `source.subAgent.thread_spawn.agent_role` fields.
- Both children read their installed skills, invoked the installed PDF wrapper, rendered PDF page 2, and opened that image through the host's image viewer.
- The analyst returned a concise, page-cited summary with the reported result and its development-only scope. It did not impose a scorecard or reproduction verdict.
- The reviewer returned one focused review with substantiated concerns, actionable questions, page references, and confidence. It did not create a panel or impose an accept/reject decision.

The synthetic [two-page fixture](../../tests/fixtures/native-acceptance-paper.pdf) is explicitly labeled as test material. It is not a research result. The [machine-readable receipt](native-agents-v0.5.0.json) binds the fixture and installed profiles/skills to SHA-256 hashes, preserves both final answers, and includes token counters for all observed QA sessions, including the preliminary run.

Raw local receipts are retained under `.local/validation/native-agents-v0.5.0/` and excluded from Git. They contain native session identifiers and local environment details; the public receipt omits those details.

## Preliminary issue and recovery

An initial ephemeral parent could not fork its unpersisted history. Starting without history let the two roles finish the paper tasks, but that preliminary run did not retain sufficient child metadata for the acceptance gate. It was not used as the role-binding pass. A normal session then passed with default history inheritance and matching host role metadata.

Both roles initially requested pages 1-3 from a two-page PDF. The reader correctly rejected that range; they corrected it to pages 1-2 and completed reading. These recoveries are retained in the receipt rather than being counted as successful first attempts.

## Scope and reproduction

This accepts native discovery, explicit role selection, skill loading, wrapper execution, rendered-page inspection, output mode boundaries, and completion on this host/version. It does not establish implicit natural-language role selection, desktop-host behavior, Claude agents, independent-review quality, general scientific reliability, or arbitrary-paper coverage.

To repeat the live check, use the fixture above in an isolated workspace and ask a normal Codex session to spawn the two installed role names for a short summary and a single review. Wait for complete outputs. Verify the actual spawn arguments, then read each child's host metadata and confirm its role before closing or archiving the session. Parsing TOML or asking a generic agent to imitate the role is not an equivalent check. The fixture does not require web access or external apps; model calls still use the configured account.
