# read-pdf-skill

Interactive CLI installer for the `read-pdf` skill. It supports:

1. Choosing Python runtime style: native / conda / uv
2. Checking whether `PyMuPDF` (`fitz`) exists in that runtime
3. Installing the skill into Codex or Claude Code skill directories

## Run with npx

After publishing to npm:

```bash
npx read-pdf-skill
```

Before npm publish, run directly from a GitHub repo:

```bash
npx github:<your-github-user>/<your-repo-name>
```

## What it installs

- `read-pdf/SKILL.md` (generated from template with your selected run command)
- `read-pdf/scripts/read_pdf.py`
- `read-pdf/agents/openai.yaml`
- `read-pdf/.installer-meta.json`

Default target paths:

- Codex: `~/.codex/skills/read-pdf`
- Claude Code: `~/.claude/skills/read-pdf` (falls back to existing Claude paths if detected)

## Local test

```bash
npm link
read-pdf-skill
```

## Release checklist

1. Update `version` in `package.json`
2. Test installer locally
3. Publish source to GitHub
4. Publish npm package (optional but recommended for simple `npx read-pdf-skill`)
