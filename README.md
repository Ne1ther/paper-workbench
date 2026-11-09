# paper-workbench

A paper-reading skill pack for Codex and Claude Code. Read PDFs, inspect evidence, analyze papers, and prepare focused reviews without turning every question into a full research report.

## Install

```bash
npx github:Ne1ther/paper-workbench
```

Requires Node.js 18+ and a Python runtime with PyMuPDF. Choose Native Python, Conda, or uv interactively. Conda wrappers activate the selected environment; they do not use `conda run`. OCR additionally needs Tesseract and the requested language data.

Preview the destinations and existing local changes without writing files or checking/installing dependencies:

```bash
paper-workbench --target codex --dry-run
```

For an unattended install, supply the actual Python interpreter:

```bash
paper-workbench --target codex --python /absolute/path/to/python --yes
```

This mode requires PyMuPDF to be ready already and does not install dependencies. It refuses to overwrite unmanaged or locally modified components. After reviewing those differences, `--force --yes` allows replacement with retained backups. `--install-root /absolute/staging/path` places the entire target layout under a separate directory for isolated validation; it does not change `HOME` or global configuration.

## Installed Components

| Component | Purpose |
| --- | --- |
| `read-pdf` | Selected-page reading, text search, OCR, PNG rendering, validated text exports, read-only local Zotero attachment resolution |
| `paper-analyst` | Source-backed summary, method reconstruction, critique, comparison, and reproduction decisions |
| `paper-review` | Single reviewer reports, rebuttal planning, review feedback, and explicitly requested panels/meta-reviews |

Codex installs skills into `~/.agents/skills/<component>` and two native custom agents:

```text
~/.codex/agents/paper-analyst-agent.toml
~/.codex/agents/paper-review-agent.toml
```

The agents are small orchestration instructions that reuse the skills and inherit the session's model settings. They do not choose a model or create a reviewer panel automatically. These locations follow the current [Codex skill](https://learn.chatgpt.com/docs/build-skills) and [custom-agent](https://learn.chatgpt.com/docs/agent-configuration/subagents) documentation. Actual custom-agent availability also depends on the host and session; copying a TOML file alone is not a host acceptance test.

Claude Code installs the three skills into `~/.claude/skills/<component>`. Codex agent files are skipped.

`paper-search` is an optional external skill and is **not bundled**. Search/novelty workflows use it only when requested and available; ordinary paper reading works without it.

## Update Protection And Migration

- The installer stages every component before replacing any installed content.
- Each installation records the package version, runtime type, and a content fingerprint. Future previews distinguish managed, modified, and unmanaged components. Runtime bytecode is ignored when checking local changes.
- Replacement retains the previous entry under `.agents/.paper-workbench-backups/<transaction>/` for Codex skills, `.codex/.paper-workbench-backups/<transaction>/` for Codex agents, or `.claude/.paper-workbench-backups/<transaction>/` for Claude skills. Backups and staging directories stay outside skill/agent discovery roots, so old templates cannot be rediscovered as installed skills. The installer prints exact backup paths and does not automatically delete backups.
- If replacement fails, the installer restores previously replaced entries. If recovery itself fails, it reports the affected destinations and backup paths for manual recovery.
- Changes made after inspection abort the install rather than being silently replaced.

Old `~/.codex/skills/<component>` entries, directory-based `~/.codex/agents/<name>/AGENT.md` profiles, and alternate historical Claude skill directories are reported and preserved. They are not automatically merged or deleted. Review local customizations before promoting them into the new locations. Hosts may expose duplicate skill names if both old and new locations are discoverable; they do not merge skill instructions. A legacy `AGENT.md` remains a manually read profile, not a native custom-agent installation.

Native-agent metadata is stored under `~/.codex/agents/.paper-workbench/`; skill metadata stays in each skill's `.installer-meta.json`.

## Reading Workflow

Use already-visible PDF content for a simple question. Escalate to `read-pdf` for controlled page access, keyword search, OCR, visual inspection, or reusable exports. The installed skill contains an absolute wrapper command that works from any working directory.

```bash
bash "$HOME/.agents/skills/read-pdf/scripts/run_read_pdf.sh" paper.pdf --pages 1-3
bash "$HOME/.agents/skills/read-pdf/scripts/run_read_pdf.sh" paper.pdf --render-page 6
bash "$HOME/.agents/skills/read-pdf/scripts/run_read_pdf.sh" paper.pdf --all --ocr auto
```

For Claude Code, use its installed `~/.claude/skills/read-pdf` path instead.

Text is enough for many section questions. When a conclusion depends on a figure/table, inspect the rendered page and cross-check axes, units, captions, footnotes, and rows/columns. Default OCR is off; automatic OCR uses a low-text threshold of 40 characters, and default PNG rendering is 200 DPI. Increase resolution when labels are too small.

Analysis matches the requested depth. A summary needs no scorecard or reproduction verdict. Reproduction decisions may be `go`, `no-go`, or `needs-more-evidence`. Ordinary reviews default to one report; independent panels require an explicit request and available agents. Unread evidence is distinguished from missing reporting and demonstrated flaws.

## Relationship To The Official PDF Skill

The [official public PDF skill](https://github.com/openai/skills/blob/main/skills/.curated/pdf/SKILL.md) covers general PDF reading, creation, and layout inspection using tools such as Poppler, reportlab, pdfplumber, and pypdf. The bundled official plugin may additionally support interactive forms.

Paper Workbench keeps its PyMuPDF reader for selected pages, OCR, Zotero attachment paths, and page-scoped evidence exports. It adopts the same principle of inspecting rendered pages when visuals matter. PDF authoring, editing, forms, and delivery-layout validation belong to an available general PDF skill. This pack does not install or replace that skill or its toolchain.

## Cache And Output Guarantees

Default exports/renders live in system temp and are keyed by source path/content hash, size/mtime, PyMuPDF version, cache schema, and reading/rendering options.

- Full exports include `.txt`, `.pages.jsonl`, and `.manifest.json`. Reuse requires a matching complete manifest, expected page count, and artifact checksums. Missing, truncated, or modified sidecars trigger regeneration.
- PNG cache entries have page manifests and checksums. Explicit `--output` files are regenerated from the current source/settings.
- Files are written through temporary siblings and atomically renamed; the completion manifest is written last. A failed extraction does not publish a partial text file as a complete cache.
- OCR fallback is reported in page records and `mode_counts`. A cache containing failed OCR is not reused as a successful OCR result.
- `--keep-temp` selects outputs excluded from this script's pruning. System temp can still be purged by the OS. Otherwise stale outputs are pruned after 24 hours with a 512 MiB size cap checked before a run; a large current run can exceed that cap until the next prune.

Use `--output` for deliberately retained deliverables and keep the export sidecars together. The reader refuses a text export that would overwrite its source PDF. Scratch artifacts should be cleaned after the task unless retention is requested.

## Zotero, LaTeX, And Access

Discover installed capabilities before using them. Zotero tools handle library search, citations, BibTeX, and authorized imports; LaTeX tools handle compilation and diagnostics. The pack assumes neither plugin is installed and does not hardcode their script paths.

If only a local attachment path is needed, `read-pdf/scripts/zotero_pdf.py` queries Zotero's local API read-only. Zotero must be running with that API enabled. The helper does not modify library items.

Identify access after checking it: `zotero_pdf`, `oa_pdf`, `html_fulltext`, `abstract_only`, `metadata_only`, or `needs_user_pdf`. A search result is a candidate until inspected. Use legal open full text or the user's normal authorized access; temporary reading does not require importing every paper into Zotero.

## Development And Validation

```bash
npm test
# Activate your Python environment with PyMuPDF first:
npm run test:pdf
```

The Python test suite additionally uses Python 3.11+ for TOML validation. It creates synthetic PDFs and isolated Codex/Claude installations in system temp. It exercises actual wrapper execution from another working directory, upgrades, local-change refusal, backup/rollback behavior, cache invalidation, interrupted exports, and scan OCR when Tesseract/English data are available. These checks do not establish real-host skill routing or independent-review quality.

Native role discovery and explicit invocation were also accepted on Codex CLI 0.167.0 on 2026-11-09. Both installed roles were selected through actual `spawn_agent.agent_type` calls, confirmed by host role metadata, and completed reading plus rendered-table inspection of a synthetic paper. The [acceptance record](docs/validation/native-agents-v0.5.0.md) describes the fixture, evidence, preliminary host issue, and limits. This live check uses model calls and is separate from the offline regression commands above; it does not establish implicit role selection, other hosts, or real-paper review quality.

The npm package ships `bin/`, `lib/`, and `templates/`; tests and runtime caches are excluded. `templates/read-pdf/SKILL.template.md` becomes an installed `SKILL.md` with the selected runtime and destination paths.
