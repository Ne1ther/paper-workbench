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

## What Is Better Now

- English-only installer prompts and docs
- Auto-detects `conda` command (no path typing)
- Auto-lists conda environments for selection
- Better `uv` UX with managed mode:
  - `uv run --with PyMuPDF ...` (recommended)
  - No manual `PyMuPDF` setup required in managed mode
- Cleaner CLI output with clear step headers and status labels

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
