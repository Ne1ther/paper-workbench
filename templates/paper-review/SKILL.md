---
name: paper-review
description: Evidence-based peer review of a specific paper, including a single reviewer report, an explicitly requested multi-agent panel, meta-review, decision synthesis, rebuttal planning, or feedback on a review. Use only when the user asks for these review workflows. For ordinary summaries, paper analysis, or literature discovery, use read-pdf, paper-analyst, or paper-search instead.
---

# Paper Review

Select the requested review mode before gathering evidence. A review request defaults to one focused reviewer report; a panel, simulated discussion, or AC decision is a separate mode.

## Modes And Outputs

- **Reviewer**: brief paper summary, substantiated strengths/weaknesses, actionable questions, and confidence. Use the venue's rubric if provided. Give a numerical score or accept/reject recommendation only when requested or required by that rubric; identify it as an assessment, not a prediction of the real decision.
- **Panel**: multiple independent reviewer perspectives and a synthesis of agreement, disagreement, and important evidence gaps. Follow `references/review-panel.md` only when the user explicitly wants a panel or multi-agent review.
- **Rebuttal**: concerns in priority order, evidence already available, additional work needed, and draft responses. Do not generate a new reviewer panel unless asked.
- **Review-feedback**: improve the review's specificity, fairness, and support. Read `references/review-feedback-checklist.md`; address the reviewer rather than rewriting the paper.
- **Meta-review / decision**: synthesize supplied reviews and verified evidence into the requested recommendation. Do not invent absent reviews or an official venue decision.

## Evidence First

1. Identify the paper version and the user's requested scope. Follow `paper-analyst` for the evidence standard; use `read-pdf` only where controlled PDF extraction, OCR, or visual inspection is needed.
2. Read the sections needed for the judgment. Inspect figures/tables directly when a concern depends on them. Resolve existing Zotero attachments through available tools; legal OA or HTML full text can also support reading.
3. Attach each major strength or concern to a real locator: PDF page/figure/table, HTML section/anchor, or manuscript file/line. Label inference explicitly.
4. Separate evidence not accessed from evidence not reported and from a demonstrated methodological flaw. Assess only what the inspected material supports; mark confidence accordingly.
5. Connect each concern to its consequence and a proportionate way to address it. Do not demand unrelated experiments or changes outside the paper's stated scope.

Use `paper-search` only when installed and the user explicitly requests related-work search, novelty verification, or baseline scouting. Otherwise use available live search within that scope or report the missing capability. A review can assess the paper's stated positioning while marking external novelty verification as unassessed.

## Panel Execution

A panel is opt-in. If the user requests independent agents and the environment supports them, give each reviewer the same source version and scope. They produce their initial assessments before seeing one another's opinions. The parent agent can synthesize the reviews; a separate AC agent is not required.

If independent agents are unavailable, explain that the role-based review is one model's serial analysis. Do not present it as independent reviewer agreement. Multiple roles repeating the same unsupported assumption do not strengthen the evidence.

Inherit current model settings unless the user or applicable configuration explicitly requests another model. This skill does not hardcode a model family or silently switch the main conversation model.

## Rebuttal Workflow

1. Map each supplied concern to the relevant claim and manuscript location.
2. Separate existing results from planned experiments, proposed edits, and unanswered issues.
3. Draft concise, self-contained responses: action or clarification, supporting evidence, and manuscript location when verified.
4. Mark issues answered, partially answered, or still open. Never state that an experiment was run or a manuscript was changed unless it actually happened.
5. Assemble evidence and response materials first. Consolidate manuscript edits when the user requests that stage; do not modify Word/Markdown/LaTeX after every comment by default.

A rebuttal request authorizes drafting within scope, not submitting a response or contacting editors/reviewers. Library imports, citation writes, and compilation should follow the corresponding user-requested workflow using installed tools.

## Output Discipline

Return only the selected mode's deliverables. Keep a compact concerns matrix for panels when it helps; avoid imposing reviewer panels, scores, AC verdicts, or a reproduction go/no-go on every review-related request.

Separate fixable reporting gaps from issues that require new evidence. Keep the writing direct and fair, with enough context to make each comment independently understandable. Save artifacts only when needed as requested deliverables; use system temp for scratch extraction/renders.
