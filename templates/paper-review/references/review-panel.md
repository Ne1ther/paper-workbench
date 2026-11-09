# Review Panel Flow

Use only for an explicitly requested panel or multi-agent review. An ordinary review, rebuttal, or review-feedback task follows its own mode in `SKILL.md`.

Give reviewers the same source version, scope, and rubric, and keep their initial reports independent. Use only authorized, available agent slots; the parent can synthesize without spawning a separate AC. Inherit current model settings unless a different model is explicitly requested. If analysis is serial, label it as one model taking multiple perspectives rather than independent reviewers.

## Recommended Roles

### Reviewer A — Novelty & positioning

Focus on:

- what is actually new
- whether the claimed contribution is differentiated
- whether the framing overstates novelty

Use `paper-search` only when the user explicitly asks for related work or novelty checking.

### Reviewer B — Technical soundness

Focus on:

- method coherence
- assumptions
- derivation / algorithm plausibility
- whether the conclusions follow from the method

### Reviewer C — Experiments & reproducibility

Focus on:

- dataset/task fit
- baseline fairness
- ablations
- statistics / variance / uncertainty
- implementation completeness

### Optional Reviewer D — Writing & clarity

Focus on:

- clarity of claims
- ambiguity in setup or evaluation
- figure / table readability
- structure and presentation

### AC / Meta-reviewer

Focus on:

- common concerns across reviewers
- whether disagreements are substantive or stylistic
- final decision under uncertainty
- writing a balanced meta-review without exposing reviewer identities

## Suggested Phase Order

1. independent reviewer pass
2. optional rebuttal / author-response pass
3. reviewer update pass, only if new evidence or an actual/simulated rebuttal was provided
4. AC meta-review
5. final decision + concerns matrix

## Concerns Matrix

Keep a compact matrix like:

| Concern | A | B | C | D |
|---|---|---|---|---|
| novelty overclaimed | ✓ |  |  |  |
| weak ablations |  |  | ✓ |  |
| unclear method detail |  | ✓ |  | ✓ |

The matrix should reflect **which reviewer raised the concern**, not how severe it is.

## Output Style

- keep reviewer focus areas distinct without fabricating independent identities
- anonymize them before meta-review
- separate “fixable in rebuttal” from “fundamental blocker”
- tie major concerns to inspected PDF pages, HTML sections, or manuscript locations; repeat agreement is not a substitute for evidence
- make scores and accept/reject decisions conditional on the user's requested output or venue rubric
