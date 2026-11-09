# Scoring Rubric

Use only when the user requests scores or asks for this rubric. Prefer a supplied venue rubric when available. Scores summarize an assessment; they are not measurements or acceptance probabilities.

## Novelty
- 9-10: Clear new problem framing or major method shift with evidence of non-trivial gain.
- 7-8: Meaningful extension or combination with clear benefit.
- 5-6: Incremental change with moderate gains.
- 1-4: Minor variation or unclear contribution.

## Technical Soundness
- 9-10: Assumptions explicit, design coherent, derivations/algorithms consistent.
- 7-8: Mostly solid, minor gaps.
- 5-6: Several unclear design decisions.
- 1-4: Major methodological weaknesses.

## Experimental Credibility
- 9-10: Strong baselines, fair setup, clear ablations, robust reporting.
- 7-8: Good experiments with moderate reporting gaps.
- 5-6: Limited baselines/ablations or unclear fairness.
- 1-4: Weak or insufficient evidence.

## Reproducibility
- 9-10: Code + data + hyperparameters + training details are complete.
- 7-8: Most artifacts available, few missing details.
- 5-6: Partial artifacts, notable gaps.
- 1-4: Reproduction likely blocked.

## Practical Value
- 9-10: Strong utility in realistic settings with clear deployment path.
- 7-8: Useful in many settings with manageable constraints.
- 5-6: Useful only in narrow conditions.
- 1-4: Limited practical impact.

## Conservative Rules
- Require an inspected source locator and a short rationale for every score (PDF page, HTML section, or source-file location).
- Mark a dimension `not assessed` when the relevant artifact was not accessed. An unread appendix or unavailable full text should lower confidence, not automatically lower the paper's score.
- Distinguish an actual reporting omission from an access limitation. Explain why an observed omission affects the claim before lowering a score.
- Score novelty only against an inspected comparison set. Searching external prior art remains conditional on the user's requested scope.
- Keep confidence separate from quality, and avoid averaging unassessed dimensions into an overall score.
