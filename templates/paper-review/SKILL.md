---
name: paper-review
description: Multi-agent conference-style review for a specific paper or PDF, including reviewer-panel assessment, meta-review, AC-style decision, rebuttal planning, and review-quality feedback. Use only when the user explicitly asks for reviewer-style assessment, multi-agent review, meta-review, AC decision, rebuttal help, or feedback on reviews. Do not use for generic PDF reading, summary, or literature search unless those are explicitly requested too.
---

# Paper Review

Use this skill for **conference-style peer review** of a specific paper.
This is a separate opt-in layer on top of `read-pdf` and `paper-analyst`.
When the task touches Zotero citations, BibTeX, or TeX compilation, hand those parts to the official Zotero and LaTeX plugins. Keep this skill focused on reviewer reasoning, rebuttal strategy, and decision quality.

## Trigger Boundary

Turn this skill on only when the user's wording clearly asks for review-style output, for example:

- "Review this like a reviewer"
- "Give me a multi-agent review"
- "Write a meta-review / AC decision"
- "Help me prepare a rebuttal"
- "Check whether this review is well written and give reviewer feedback"

Do **not** turn this skill on for:

- "Summarize this paper"
- "Read page 6"
- "Find related work"

Those belong to `read-pdf`, `paper-analyst`, or `paper-search` unless the user explicitly asks for review workflow.

## Default Stack

- native PDF/context reading: quick orientation when the paper is already visible in context
- `read-pdf`: ingest the paper and inspect figures/tables when needed
- `paper-analyst`: build evidence-backed understanding of the paper
- `paper-review`: convert that understanding into reviewer-style judgments
- official Zotero plugin: optional citation/BibTeX handoff for rebuttal drafts or manuscript edits
- official LaTeX plugin: optional compile/diagnostic handoff for TeX manuscripts

Use `paper-search` only when the user explicitly asks for novelty checks, missing related work, or baseline scouting.

## Preferred Execution Mode

If the environment supports subagents and the user explicitly wants a multi-agent review, prefer a **review panel**:

1. **Reviewer A - novelty & positioning**
2. **Reviewer B - technical soundness**
3. **Reviewer C - experiments & reproducibility**
4. **Meta-review / AC agent** consolidates anonymously

Optional roles when explicitly requested:

- **Reviewer D - writing & clarity**
- **Related-work reviewer** via `paper-search`
- **Review-feedback critic** to improve the review itself
- **Rebuttal coach** to draft author responses

If subagents are unavailable, simulate the same roles serially but keep role boundaries explicit.

## Review Pipeline

### 1. Paper ingestion

- Read only the needed pages first.
- Inspect figures/tables directly when a key judgment depends on them.
- Build an evidence ledger before writing opinions.

### 2. Independent reviewer pass

Each reviewer should produce an independent review before seeing the others.
Each major claim should be page-cited or clearly labeled as inference from evidence.

Required reviewer outputs:

- one-sentence summary
- main strengths
- main weaknesses
- confidence / support level
- preliminary score or verdict

### 3. Optional author rebuttal pass

Run only when the user asks for rebuttal help or discussion simulation.

- Collect the top concerns
- Draft concise author responses
- Mark which concerns are fully answered, partially answered, or still open

### 4. Reviewer update pass

After rebuttal, each reviewer may revise:

- score / verdict
- top concerns
- confidence

### 5. Meta-review / AC pass

Aggregate the reviewer outputs **anonymously**.
Focus on:

- common concerns raised by multiple reviewers
- unique but critical concerns raised by only one reviewer
- whether weaknesses are fixable in rebuttal or fundamental
- final recommendation

Do not let agreement between reviewers substitute for evidence quality. If multiple reviewers repeat the same unsupported assumption, call that out instead of strengthening the claim.

Also produce a compact **concerns matrix** showing which reviewer raised which issue.

### 6. Optional review-feedback pass

When the input is an existing review, critique the **review quality itself**.
The goal is to help the reviewer improve the review, not to address the authors directly.

### 7. Optional manuscript handoff

Run only when the user asks to edit a manuscript, rebuttal, or response letter with citations or TeX output.

- Use the official Zotero plugin for citation lookup, BibTeX export/sync, and citation insertion.
- Use the official LaTeX plugin for compiling the TeX project and diagnosing build errors.
- Keep review judgments page-cited and separate from compiler or bibliography issues.

## Review Modes

- **Reviewer mode**: produce a single high-quality review
- **Panel mode**: produce multiple reviewer perspectives plus meta-review
- **Rebuttal mode**: produce response strategy and issue triage
- **Review-feedback mode**: improve a draft review
- **Decision mode**: produce AC-style accept / reject recommendation

## Output Contract

Unless the user asks otherwise, return:

### A. Quick Verdict

- paper/task
- overall take
- recommendation: `accept` / `weak accept` / `borderline` / `weak reject` / `reject`

### B. Reviewer Panel

For each reviewer:

- focus area
- strengths
- weaknesses
- confidence
- score / stance

### C. Meta-Review

- consensus points
- unique but important issues
- concerns matrix
- final recommendation

### D. Optional Extras

- rebuttal priorities
- author response bullets
- review-quality feedback to the reviewer

## Hard Control

If the user wants exact routing instead of natural-language triggering, they can explicitly name:

- `paper-review`
- `paper-review-agent`
- `read-pdf`
- `paper-analyst`
- `paper-search`

## References

Read `references/review-panel.md` for the multi-agent review flow.
Read `references/review-feedback-checklist.md` when auditing review quality.
