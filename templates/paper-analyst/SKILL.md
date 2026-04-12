---
name: paper-analyst
description: Rigorous research-paper analysis from PDFs or paper manuscripts once the source artifact is loaded, with evidence-backed summaries, method reconstruction, experiment audits, reproducibility checks, comparison support, and follow-up recommendations. Use when users ask to deeply read, critique, compare, or decide whether to reproduce a specific academic paper or PDF, especially when page-cited judgments are required or the paper includes scanned pages, tables, figures, or arXiv source context. Do not turn on literature search unless the user explicitly asks for related work, novelty checks, baselines, or recent papers.
---

# Paper Analyst

Use this skill after loading the source document. For PDFs, pair it with `read-pdf` and deliberately choose between plain extraction, OCR, rendered-page inspection, or a hybrid of these modes.
For full paper-analysis tasks from a PDF, prefer letting `paper-analyst-agent` orchestrate this skill together with `read-pdf` when that reusable agent profile is available.
Only pair this skill with `paper-search` when the user explicitly asks for related work, novelty, field positioning, baselines, or recent-paper scouting.

## Routing Snapshot

- **Quick attached-PDF orientation or a tiny quote lookup from already-visible PDF context** -> native PDF reading is fine.
- **Raw PDF reading, page lookup, figure/table inspection, OCR, or export** -> use `read-pdf` first.
- **Deep understanding, critique, reproduction decision, or comparison** -> use `paper-analyst`.
- **Reviewer-style judgment, meta-review, rebuttal, or AC decision** -> switch to `paper-review`.
- **Related work, novelty boundary, baseline hunting, or recent-paper scan** -> add `paper-search`, but only when the user explicitly asks.

## Trigger Boundary

Turn this skill on for prompts like:

- "Read this paper deeply"
- "Critically analyze this paper"
- "Is this worth reproducing"
- "Compare these two papers"

Do **not** auto-enable `paper-search` just because the analysis mentions novelty or related work in passing.
Only do that when the user explicitly asks to search, find, scout, survey, or fill in the literature landscape.
If the user wants a conference-style reviewer report, meta-review, AC decision, rebuttal workflow, or multi-agent review, switch to `paper-review` / `paper-review-agent` instead of stretching this skill into that role.

## Supported Tasks

- Deep summary with page evidence
- Critical review or experiment audit
- Reproduction decision (`go` / `no-go`)
- Paper comparison
- Method breakdown from a PDF with figure/table support

## Run Workflow

### 1. Scope the task first

Classify the request before reading deeply.

- `summary`: concise understanding of problem, method, and result
- `critique`: strengths, weaknesses, fairness, and evidence quality
- `reproduction-decision`: whether the paper is worth reproducing or following up
- `comparison`: compare multiple papers after separate per-paper analysis
- `related-work-gap`: locate close neighbors first, then judge how differentiated the paper really is

Default to `critique` when the user says "analyze this paper" without more guidance.

### 2. Acquire the right artifact

Do not start deep analysis from a vague citation alone.

- If the user provided a local PDF, use that artifact directly.
- If the user provided an arXiv link and analysis depends on implementation detail, method reconstruction, or appendix-heavy evidence, read `references/arxiv-source-first.md` and consider source-first inspection after the PDF pass.
- If the user provided only a title, abstract snippet, or screenshot, first obtain the real paper artifact before giving high-confidence judgments.

### 3. Choose the PDF ingestion mode via `read-pdf`

Do not read every page the same way.

- If Codex already has enough visible PDF context for quick orientation, use that first before escalating.
- Prefer scoped `read-pdf` calls first (`--toc`, `--page`, `--pages`, `--search`) instead of dumping the whole document by default.
- Start with native text extraction for abstract, intro, conclusion, and likely method / experiment pages.
- If the PDF is scanned or extracted text is obviously incomplete, use OCR via `read-pdf`.
- If the user asks about figures, charts, architecture diagrams, tables, or layout-sensitive evidence, render the relevant pages to PNG and inspect those images directly.
- For dense result tables or image-heavy pages, use a hybrid workflow: rendered-page inspection plus text extraction or OCR on the same pages.
- Reuse any matching `read-pdf` cached export or render before regenerating it.
- If the paper is on arXiv and the user wants a method teardown, table extraction, or pipeline reconstruction, read `references/arxiv-source-first.md` and consider source-first inspection before relying only on the PDF.

Preferred heuristics:

- native-text paper: text extraction first
- scanned paper: `read-pdf` with OCR
- figure/table question: render pages first, then cross-check with text or OCR
- full-document extraction on likely scans: OCR-enabled full export

### 4. Build the paper map before judging

Create a compact map of the paper:

- title, authors, venue, year
- research question / task definition
- method path as `input -> modules -> output`
- claimed contribution(s)
- what evidence would be needed to support those claims

### 5. Maintain an evidence ledger

Every major judgment must be evidence-backed.

Use these evidence labels when helpful:

- `text evidence (p.X)`
- `figure/table evidence (p.X)`
- `inference from evidence (p.X-p.Y)`

Rules:

- Never cite a claim without page evidence unless it is explicitly your inference.
- If evidence is partial, say so.
- If the figure/table seems to say something slightly different from the text, surface the mismatch.
- If a conclusion depends mainly on a figure caption or rendered page impression, say that explicitly instead of treating it like clean body-text evidence.
- If you keep any rendered page or exported text file for follow-up, mention the absolute path explicitly.

### 6. Audit the paper systematically

Check the following dimensions explicitly:

- problem framing and scope
- method coherence and assumptions
- dataset / task fit
- metric fit
- baseline fairness
- ablation sufficiency
- statistical reporting, variance, or significance information
- limitations, failure cases, and boundary conditions
- reproducibility artifacts: code, data, hyperparameters, training details, compute

For each major claim, judge support strength as:

- `strong`
- `medium`
- `weak`

### 7. Turn the audit into a recommendation

Decide whether follow-up should be `go` or `no-go`.

- `go`: the paper is promising enough to reproduce, adapt, or study further
- `no-go`: evidence quality, practicality, or reproducibility risk is too weak

If `go`, give 3 concrete next steps.
If `no-go`, state the main blocker(s).

### 8. Optional related-work gap check

Use this only when the user explicitly asks:

- whether the idea is novel
- what papers are closest in the field
- what baselines should be compared
- whether the draft is missing important related work

Workflow:

- use `paper-search` to gather close neighbors and strong baselines
- compare the target paper's real differentiators against those neighbors
- call out overlaps, likely novelty boundaries, and missing citations

## Output Contract

Always output two layers unless the user explicitly requests otherwise.

### Layer A: Quick View (<=200 words)

- Research question
- Main takeaway
- Follow-up decision: `go` or `no-go`

### Layer B: Detailed Analysis

1) Paper metadata
2) Core contributions (3-5 bullets, each with page evidence)
3) Method reconstruction and baseline differences
4) Experiment audit and support-strength judgment
5) Limitations, risks, and failure modes
6) Reproducibility checklist (provided vs missing)
7) Quantitative scores (1-10) with evidence for each:
   - novelty
   - technical soundness
   - experimental credibility
   - reproducibility
   - practical value
8) Final recommendation and next steps

When helpful, add a compact **Evidence Gaps** subsection listing the 2-4 biggest missing pieces that block stronger confidence.

## Comparison Mode

If multiple papers are provided:

- build one evidence-backed map per paper first
- keep page citations attached to the correct paper
- only then produce cross-paper comparison

Recommended comparison axes:

- problem framing
- method differences
- evidence quality
- reproducibility readiness
- practical follow-up value

## Operating Rules

- Never fabricate missing details.
- State `uncertain` when evidence is insufficient.
- Prefer direct evidence over subjective interpretation.
- Keep concise writing, but never omit evidence for key judgments.
- Do not let a polished abstract or intro substitute for experimental evidence.
- Use rendered-page inspection whenever a key conclusion depends on a figure, table, chart, or layout.
- Prefer OCR only when it adds evidence; do not slow every workflow down by default.
- When invoking `read-pdf`, use its wrapper or an activated in-shell runtime instead of `conda run -n`.
- When the user explicitly asks for field positioning or novelty checks, use `paper-search` first rather than inferring the literature from one paper alone.

## Optional Reference

Read `references/scoring-rubric.md` when a deeper scoring standard is needed.
Read `references/arxiv-source-first.md` when an arXiv paper needs source-first teardown.
