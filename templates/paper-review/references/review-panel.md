# Review Panel Flow

This reference captures the multi-agent review pattern adapted from conference-style review systems.

## Recommended Roles

### Reviewer A - Novelty & positioning

Focus on:

- what is actually new
- whether the claimed contribution is differentiated
- whether the framing overstates novelty

Use `paper-search` only when the user explicitly asks for related work or novelty checking.

### Reviewer B - Technical soundness

Focus on:

- method coherence
- assumptions
- derivation / algorithm plausibility
- whether the conclusions follow from the method

### Reviewer C - Experiments & reproducibility

Focus on:

- dataset/task fit
- baseline fairness
- ablations
- statistics / variance / uncertainty
- implementation completeness

### Optional Reviewer D - Writing & clarity

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
3. reviewer update pass
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

- keep reviewer voices distinct
- anonymize them before meta-review
- separate "fixable in rebuttal" from "fundamental blocker"
