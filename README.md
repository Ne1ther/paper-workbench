# paper-workbench

Interactive installer for a paper workflow skill pack for Codex and Claude Code.

This repo installs a broader paper workflow stack:

- `read-pdf`: deterministic PDF reading, OCR fallback, render-to-image, temp caching
- `paper-analyst`: page-cited paper analysis, critique, comparison, go/no-go follow-up decisions
- `paper-review`: reviewer-panel, meta-review, rebuttal, and AC-style review workflows
- `paper-analyst-agent` and `paper-review-agent`: Codex agent profiles that orchestrate the skills above

## Quick Start

Install directly from GitHub:

```bash
npx github:Ne1ther/paper-workbench
```

## What Gets Installed

### Codex

- `~/.codex/skills/read-pdf`
- `~/.codex/skills/paper-analyst`
- `~/.codex/skills/paper-review`
- `~/.codex/agents/paper-analyst-agent`
- `~/.codex/agents/paper-review-agent`

### Claude Code

- `~/.claude/skills/read-pdf`
- `~/.claude/skills/paper-analyst`
- `~/.claude/skills/paper-review`

Claude Code installs the skill pack only. The reusable agent profiles are Codex-specific and are skipped there.

## Why This Is Better

- Better naming: the package now matches the real scope instead of only the bottom-layer PDF reader
- `read-pdf` now behaves like an ingestion layer, not a catch-all paper workflow
- Paper analysis and paper review are split into their own skills with explicit routing boundaries
- Codex gets reusable agents for end-to-end orchestration on top of the skills
- Conda installs use an activation wrapper instead of `conda run -n`
- Default exports/renders land in system temp with cache reuse and cleanup guidance

## Runtime Setup Flow

### 1. Python runtime selection

- `Native Python`: use `python3` or `python` from `PATH`
- `Conda`: detect `conda`, choose an env, and generate an activation wrapper
- `uv`: use managed mode (`uv run --with PyMuPDF ...`) or the current uv environment

### 2. PyMuPDF check

- Verifies whether `import fitz` works in the selected runtime
- Offers to install `PyMuPDF` automatically when needed

### 3. Target installation

- Installs the skill pack into Codex or Claude Code
- Installs the reusable agents only when the target is Codex

## Included Read-PDF Capabilities

- Native-text extraction for targeted reading and search
- OCR modes: `off`, `auto`, `force`
- Render-to-PNG for figures, tables, charts, and layout-sensitive pages
- Cached full-text exports with `.pages.jsonl` and `.manifest.json` sidecars
- Temp-output reuse, TTL pruning, and size-cap cleanup
- Tesseract language selection such as `eng` or `chi_sim+eng`

## Included Paper Analysis Capabilities

- Deep summary with page evidence
- Critical experiment audit
- Reproduction or follow-up decision (`go` / `no-go`)
- Comparison mode across multiple papers
- Optional routing to `paper-search` when the user explicitly asks for related work or novelty checks

## Included Paper Review Capabilities

- Reviewer-style single review
- Reviewer panel with role separation
- Meta-review / AC-style recommendation
- Rebuttal planning
- Review-quality feedback for existing reviews

## Project Layout

- `bin/install-paper-workbench.js`: interactive installer
- `templates/read-pdf`: the PDF ingestion skill
- `templates/paper-analyst`: the evidence-backed analysis skill
- `templates/paper-review`: the reviewer-style skill
- `templates/agents`: reusable Codex agents

## Requirements

- Node.js 18+
- One Python runtime option:
  - Native Python
  - Conda
  - uv

## Local Development

Link the CLI locally:

```bash
npm link
paper-workbench
```
