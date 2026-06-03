# paper-workbench

Interactive installer for a paper workflow skill pack for Codex and Claude Code.
It is designed to sit beside the official Codex Zotero and LaTeX plugins: paper-workbench handles paper discovery, temporary full-text reading, evidence extraction, analysis, and review; the official plugins handle the user's Zotero library, citations, BibTeX, and TeX compilation.

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
- Official Zotero and LaTeX plugins are treated as first-class neighbors instead of being reimplemented here
- Zotero remains a durable reference library, not a scratch cache for every paper inspected during research
- Conda installs use an activation wrapper instead of `conda run -n`
- Default exports/renders land in system temp with cache reuse and cleanup guidance

## Official Plugin Integration

paper-workbench does not replace the official Codex plugins. It routes around them.

### Zotero

Use the official Zotero plugin for library-aware work:

- checking Zotero readiness and local API status
- searching the user's existing Zotero library
- listing collections, tags, item keys, and BibTeX keys
- exporting or syncing `references.bib`
- inserting citations into TeX or Markdown drafts
- importing BibTeX/RIS records when the user explicitly asks to save them

Use `read-pdf` for the actual PDF reading layer after a PDF path is resolved. If the official plugin is not available or the task only needs a local Zotero attachment path, the installed `read-pdf` skill also includes a lightweight `scripts/zotero_pdf.py` fallback for resolving local PDF attachments from Zotero's local API.

### LaTeX

Use the official LaTeX plugin for TeX project health checks and compilation:

- `latex-compile` for `.tex` builds, using bundled Tectonic for simple projects and TeX Live or MacTeX for bibliography-heavy projects
- `latex-doctor` for environment diagnosis
- `texlive-runtime-installer` only when no usable local TeX toolchain exists and the user wants Codex-managed TeX Live

paper-workbench should only prepare or edit the paper evidence, citation intent, and review text. It should not maintain a separate LaTeX compiler workflow.

### Retrieval Policy

Use access labels during paper research:

- `zotero_pdf`: the paper is already in Zotero with a local PDF attachment; resolve the path and read it through `read-pdf`
- `oa_pdf`: a legal open-access PDF is available; read it as a temp artifact unless the user asks to save it
- `html_fulltext`: publisher or preprint HTML has enough full text; read the web page directly when possible
- `abstract_only`: only metadata or abstract is available; do not make high-confidence paper judgments
- `needs_user_pdf`: full text requires login, paywall access, or manual PDF acquisition

Default behavior: keep process-stage papers in temp outputs, and promote only durable references into Zotero. For publisher-login PDFs, the user handles manual download or Zotero Connector save; paper-workbench should not try to bypass publisher access controls.

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
