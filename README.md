# read-pdf-skill

Interactive installer for the `read-pdf` skill (Codex / Claude Code).

This CLI guides users through:

1. Selecting Python runtime type (`native`, `conda`, or `uv`)
2. Checking `PyMuPDF` (`fitz`) availability
3. Installing the skill into Codex or Claude Code

## Quick Start

Run directly from GitHub:

```bash
npx github:Ne1ther/read-pdf-skill
```

After publishing to npm, users can run:

```bash
npx read-pdf-skill
```

## Skill Capabilities

The installed `read-pdf` skill now supports:

- Native-text PDF extraction for targeted reading, search, TOC inspection, and full-text export
- OCR-aware workflows with `--ocr off|auto|force`
- Render-to-PNG workflows for figure-, chart-, table-, and layout-heavy pages
- Search / extraction that can reuse OCR output when text extraction is weak
- Tesseract language selection such as `eng` or `chi_sim+eng`
- Figure/table caption extraction across native-text and OCR-assisted pages

## What Is Better Now

- English-only installer prompts and docs
- Auto-detects `conda` command (no path typing)
- Auto-lists conda environments for selection
- Better `uv` UX with managed mode:
  - `uv run --with PyMuPDF ...` (recommended)
  - No manual `PyMuPDF` setup required in managed mode
- Cleaner CLI output with clear step headers and status labels
- New installed skill workflow for OCR fallback and rendered-page inspection

## Installation Flow

### Step 1: Runtime selection

- `Native Python`: detects `python3/python` from `PATH`
- `Conda`: detects conda executable and lets user pick from discovered envs
- `uv`: detects `uv` executable and recommends managed mode

### Step 2: PyMuPDF check

- Verifies if `fitz` can be imported in the selected runtime
- If missing (native/conda/current uv env), offers auto-install

### Step 3: Target selection

- `Codex`: installs to `~/.codex/skills/read-pdf`
- `Claude Code`: installs to `~/.claude/skills/read-pdf`

## Installed Files

- `read-pdf/SKILL.md` (generated from template with runtime command)
- `read-pdf/scripts/read_pdf.py`
- `read-pdf/agents/openai.yaml`
- `read-pdf/.installer-meta.json`

## Example Installed Commands

Depending on the selected runtime, the generated skill will embed a command like:

```bash
~/miniforge3/bin/conda run -n torch_t python scripts/read_pdf.py <pdf_path> [options]
```

Useful options in the installed skill include:

- `--page 3`
- `--pages 1-5`
- `--search "keyword" --ignore-case`
- `--figures`
- `--toc`
- `--all --output ./full_text.txt`
- `--render-page 3 --output ./page-3.png`
- `--render-pages 10-12 --output ./renders/`
- `--ocr auto`
- `--ocr force --ocr-lang chi_sim+eng`

## Requirements

- Node.js 18+
- One Python runtime option:
  - Native Python
  - Conda
  - uv

## Remove / Uninstall

Delete the installed skill folder:

- Codex: `rm -rf ~/.codex/skills/read-pdf`
- Claude Code: `rm -rf ~/.claude/skills/read-pdf`

## Developer Notes

Local test:

```bash
npm link
read-pdf-skill
```

Package build:

```bash
npm pack
```
