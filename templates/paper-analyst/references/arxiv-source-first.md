# ArXiv Source-First Deep Reading

Use this reference when the user provides an arXiv paper and wants more than a normal PDF summary.

## When to Use It

- The user gives an arXiv URL instead of only a PDF
- The paper is method-heavy and the PDF alone feels compressed
- The user asks for table extraction, architecture understanding, or pipeline reconstruction
- You suspect the PDF hides detail that is clearer in the LaTeX source

## Source-First Heuristic

Prefer this order:

1. arXiv source archive (`/src`) when available
2. LaTeX entry file and recursively included sections
3. Figure/table assets referenced by the source
4. PDF fallback for layout and visual confirmation

## What to Recover From Source

- title and paper structure
- method path (`input -> modules -> output`)
- training details and implementation notes
- experiment tables and ablations
- pipeline / framework figure when clearly identifiable

## Practical Guardrails

- Treat source parsing as a supplement, not a replacement for PDF evidence.
- If source and PDF disagree, surface the mismatch explicitly.
- If `/src` is unavailable or messy, fall back to the PDF and keep going.
- Do not claim a figure is the main pipeline unless the caption, label, or context strongly supports it.
