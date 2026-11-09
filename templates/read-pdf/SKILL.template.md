---
name: read-pdf
description: Read PDF pages, search text, OCR scans, inspect rendered figures and tables, or export page-scoped text with PyMuPDF. Also resolve local Zotero PDF attachments read-only. For ordinary PDF creation, editing, forms, or layout delivery, use an available general PDF skill; paper analysis and formal reviews belong to paper-analyst and paper-review.
---

# Read PDF

Use already-visible PDF content for a simple question when it is sufficient. Use this skill when deterministic page selection, OCR, rendered figures/tables, or reusable exports would help. Match the amount read to the question.

## Run

The installed wrapper resolves its script directory and selected Python runtime, so it works from any working directory:

```bash
{{WRAPPER_COMMAND}}
```

Manual equivalent:

```bash
{{MANUAL_COMMAND}}
```

Use the wrapper or activate its chosen environment in the same shell. Do not assume the current working directory is the skill directory.

## Choose The Reading Mode

- Text, a quote, or a section: start with native extraction and selected pages or keyword search.
- Scanned or incomplete text: use `--ocr auto`; use `--ocr force` when the user asks for OCR or automatic detection misses relevant text.
- A figure, table, plot, equation layout, or diagram: render the relevant pages and inspect the PNGs directly. Check axes, units, rows/columns, captions, footnotes, and sample sizes against extracted text. An extraction alone cannot establish visual correctness.
- Full-text export: use `--all`, adding OCR when needed. Keep the text, page records, and manifest together.

The official general PDF skill also emphasizes rendered-page inspection. Use that skill when creating/editing PDFs, filling forms, or validating a PDF deliverable; this reader does not replace those authoring workflows. Do not install another rendering stack merely because it exists if the available renderer answers the question.

## Options

- No option: metadata and the first three pages.
- `--toc`: embedded table of contents.
- `--page 3`, `--pages 1-5`, or `--pages 1,3,8`: selected pages, using one-based PDF page indices.
- `--search "keyword" [--ignore-case]`: matching pages.
- `--figures`: likely captions from text, not figure cropping; no matches does not mean there are no figures.
- `--all [--output <file.txt>]`: full text plus `.pages.jsonl` and `.manifest.json` sidecars.
- `--render-page 3 [--output <file.png>]`, `--render-pages 10-12 [--output <directory>]`: PNG pages.
- `--ocr off|auto|force`, `--ocr-lang chi_sim+eng`, `--ocr-dpi 300`, `--ocr-full`, `--tessdata <directory>`: OCR settings. Tesseract and the requested language data must be available.
- `--ocr-min-chars 40`: low-text threshold for automatic OCR.
- `--render-dpi 200`: rendering resolution; increase for small labels.
- `--max-chars 0`: disable printed-page truncation.
- `--keep-temp`: exclude default outputs from this tool's automatic pruning; the OS can still purge system temp.
- `--no-prune`: skip pruning for this invocation.

Default exports/renders use system temp. Reuse requires matching source content, runtime version, options, and complete validated artifacts. Explicit `--output` destinations are regenerated, so they reflect the current PDF and rendering settings. Do not overwrite a user-owned output without the task's authorization.

## Zotero And Access

For a known title, DOI, or library key, discover installed Zotero search/attachment tools before using them. Do not assume an official plugin or a particular command exists. Read a resolved PDF in place.

When only a local attachment path is needed and Zotero tools are unavailable, the bundled `scripts/zotero_pdf.py` queries Zotero's local API read-only. Run it with the same activated Python runtime as the reader:

```bash
# Resolve this path from the installed skill directory:
SKILL_DIR={{SKILL_DIRECTORY}}
# After activating the selected runtime:
python "$SKILL_DIR/scripts/zotero_pdf.py" --doi "10.xxxx/xxxxx" --print-path
python "$SKILL_DIR/scripts/zotero_pdf.py" --key <item-key> --read -- --page 1
```

Zotero must be running with its local API enabled. The resolver does not import or modify library items.

If no local PDF exists, try legal OA/arXiv/author full text or readable article HTML. Keep access separate from relevance: use `zotero_pdf`, `oa_pdf`, `html_fulltext`, `abstract_only`, `metadata_only`, or `needs_user_pdf` after checking. A failed fetch is not evidence that a paper has no full text. Use the user's normal authorized access; try legal alternatives before asking for a manually acquired copy. Save to Zotero only within requested library work.

## Evidence And Output

- Report the source version and PDF page indices; distinguish printed page labels when they differ. For HTML, use real section/figure anchors rather than invented PDF pages.
- Inspect complete relevant pages when a conclusion depends on a figure/table, including material captions and footnotes. Separate visual evidence, extracted text, OCR, and inference.
- Report OCR warnings or `text-fallback` as reduced coverage. A successful export is not proof that OCR succeeded on every page; inspect `mode_counts` in the manifest.
- Prefer a short answer with the source locators needed to assess it. Keep scratch artifacts in system temp and clean task-created files when finished unless retention was requested. Do not delete shared pre-existing caches needed by other work.
- Mention retained absolute output paths when they are useful deliverables. Text sidecars are machine-readable evidence, not a completed paper critique.

## Adjacent Work

Use `paper-analyst` for interpretation/reproduction decisions and `paper-review` for formal reviews or rebuttals. Add `paper-search` only for explicitly requested literature discovery and only if available. Citation/library writes and LaTeX compilation use the actual installed tools within the user's scope.
