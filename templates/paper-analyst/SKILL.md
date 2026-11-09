---
name: paper-analyst
description: Analyze a specific research paper using the actual PDF, article HTML, or source manuscript. Use for summaries, method reconstruction, critical analysis, experiment audits, paper comparisons, and reproduction decisions with traceable evidence. Add literature search only when the user explicitly requests related work, novelty verification, baselines, or field positioning; route formal reviews and rebuttals to paper-review.
---

# Paper Analyst

Match the depth to the user's question and keep conclusions tied to the version actually read. `read-pdf` handles PDF ingestion; this skill handles interpretation. The optional `paper-analyst-agent` profile orchestrates these skills without duplicating their rules.

## Choose The Mode

- `summary`: problem, main idea, key result, and its scope; a short answer can be complete.
- `critique`: method assumptions, evidence quality, strengths, and consequential weaknesses. This is the default for an unspecified deep analysis.
- `reproduction-decision`: assess feasibility and expected value, then recommend `go`, `no-go`, or `needs-more-evidence`.
- `comparison`: map each paper independently before comparing compatible claims and settings.
- `related-work-gap`: only when explicitly requested; use `paper-search` to obtain close neighbors before judging differentiation.

A summary does not require numerical scores, a reproduction verdict, or a full experiment audit. Formal reviewer reports, meta-reviews, and rebuttals belong to `paper-review`.

## Acquire And Identify The Source

1. Use a supplied local PDF/manuscript directly. Record title, version, venue/year, and stable DOI/arXiv link when available.
2. For title/DOI/Zotero-key input, inspect available Zotero tools if the paper may be in the library. Use `read-pdf`'s read-only resolver when only a local attachment path is needed. Do not assume a Zotero plugin is installed.
3. Otherwise use legal OA/arXiv/author full text or readable article HTML. Temporary reading does not require a Zotero import. Suggest saving only references likely to be reused, within the user's library-management scope.
4. If only an abstract or partial pages are available, provide a limited summary and identify what is not assessed. Seek the real full text before making detailed experimental or reproducibility judgments.
5. If login/manual access is needed and the paper matters, label it `needs_user_pdf`. Try legal alternatives first and use only the user's normal authorized access.

Access labels, after checking: `zotero_pdf`, `oa_pdf`, `html_fulltext`, `abstract_only`, `metadata_only`, `needs_user_pdf`. A link returned by search is only a candidate until inspected.

## Read Selectively

- Use already-visible PDF content for a simple question if it is sufficient.
- For controlled PDF reading, follow `read-pdf` and start with `--toc`, `--search`, `--page`, or `--pages` around the relevant claims.
- Use native text first, OCR for missing/scanned text, and rendered pages for figure/table-dependent judgments. Cross-check rows, columns, axes, units, and captions directly.
- Reuse matching cached extraction/renders. Keep generated artifacts in system temp and clean task-created files after use unless retention was requested.
- Read `references/arxiv-source-first.md` only when source files would clarify equations, tables, appendices, or implementation detail. Source text supplements the paper; it does not prove an experiment ran.

## Build An Evidence Map

Before judging, identify the research question, assumptions, method path (`input -> modules -> output`), central claims, and the experiments that support them. Use a compact internal ledger; expose a table only when it helps the answer.

Each major judgment needs an actual locator:

- PDF: paper/version plus page and, where useful, figure/table/equation number. Distinguish PDF page index from printed page labels when they differ.
- Article HTML: section heading and stable anchor or a clearly identified paragraph/figure.
- LaTeX/source: file and line/section; do not invent PDF page numbers.

Separate direct text/visual evidence from your inference. Preserve conflicts between a caption, plot, table, and prose instead of smoothing them over.

Distinguish three states: **not accessed**, **not reported in the inspected material**, and **a demonstrated weakness**. Limited access lowers assessment confidence; it is not itself evidence of a bad paper.

## Audit When The Mode Requires It

For critique or reproduction work, inspect the dimensions relevant to the central claim:

- problem definition, assumptions, and scope
- method coherence and derivation/algorithm details
- dataset/task fit, train/validation/test roles, and potential leakage
- metric choice and baseline comparison conditions
- ablation support, variance/uncertainty reporting, and failure cases
- code, data, hyperparameters, compute, and other reproduction dependencies

Use `strong`, `medium`, or `weak` support only with a reason and locator. Do not treat unavailable code, an unread appendix, or absent statistical reporting as the same issue. When comparing studies, explain incompatible settings before comparing headline numbers.

For a reproduction decision, explain the main benefit, the concrete blocker or uncertainty, and the next step that would resolve it. Do not force `go`/`no-go` when the decisive artifact is unavailable. Estimate effort only when the task and resource assumptions are stated.

## Output By Mode

Lead with the answer, then include the evidence needed to assess it.

- Summary: problem, method, key result, scope, and source locators. No mandatory scorecard.
- Critique: concise takeaway, method reconstruction, strongest supported findings, consequential limitations, and evidence gaps. Expand only as needed.
- Reproduction decision: recommendation, feasibility/artifact assessment, and a few prioritized next steps.
- Comparison: a compact per-paper evidence map and a table of the relevant differences; attach each locator to the correct paper.
- Related-work gap: inspected neighbor set, concrete overlap/differences, and uncertainty from search/access coverage.

Use `references/scoring-rubric.md` only when the user asks for scores or supplies a rubric. A numerical novelty score needs an inspected comparison set; otherwise mark it `not assessed`.

## Adjacent Workflows

Add `paper-search` only for explicit literature discovery, novelty verification, missing references, baselines, or field positioning, and only when installed. Otherwise use available live search with an explicit coverage record or report the missing capability. A passing mention of novelty in one paper does not trigger a search.

Use installed Zotero tools for requested citation/library operations and installed LaTeX skills for requested compilation. Discover actual capabilities before calling them; report missing tools plainly and use available read-only alternatives. Keep compiler errors separate from research judgments. Manuscript edits require manuscript-editing scope, and reviewer-response evidence should be assembled before the user's requested consolidation stage.
