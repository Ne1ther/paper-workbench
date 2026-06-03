---
name: read-pdf
description: Read and inspect PDF files with PyMuPDF, including large PDFs, scanned PDFs, OCR fallback, figure/table-heavy pages, and local Zotero PDF attachments after their path is resolved. Use only when a user asks to read a PDF, extract specific pages, search inside a PDF, inspect figures or tables, print the table of contents, render pages to images, export PDF text, or read a specific Zotero-attached PDF. Do not turn on paper search, citation management, LaTeX compilation, or paper critique unless the user explicitly asks for those.
---

# Read PDF

Use the bundled script to read PDF files reliably when native PDF context is not enough, then choose text extraction, OCR, or rendered-page inspection based on the user's intent.
Always use the skill's wrapper command (or activate the chosen runtime in the same shell session first) instead of `conda run -n`.
When the official Zotero plugin is installed, use it for Zotero library search, citation export, BibTeX sync, citation insertion, and Zotero writes. Use this skill only after a concrete PDF path has been resolved, or use the local fallback helper here only to resolve Zotero PDF attachment paths.

## Positioning

`read-pdf` is an **upgrade path**, not a blind replacement for built-in PDF reading.

- If Codex/App already exposes the attached PDF content clearly and the task is simple, use native PDF/context reading first.
- Escalate to `read-pdf` when you need deterministic page control, keyword search across the file, OCR, rendered-page inspection, full-text export, or reusable temp artifacts.
- If the user asks for a paper already saved in Zotero, prefer the official Zotero plugin to search the library and identify item/attachment keys. Then read the resolved local PDF through `read-pdf`.
- Keep Zotero as a durable reference library. Do not save every process-stage paper into Zotero just because it was inspected during research.
- Prefer the lightest tool that answers the question correctly.

## Routing Snapshot

- **Quick attached-PDF orientation or a short answer from already-visible PDF context** -> native PDF reading is fine.
- **Known Zotero item, citation key, DOI, or title already in the user's library** -> use the official Zotero plugin first, then read the resolved local PDF through `read-pdf`.
- **Only need a local Zotero PDF path and the official plugin is unavailable** -> use `scripts/zotero_pdf.py` as a lightweight fallback.
- **Raw page reading, search, TOC, caption lookup, OCR, render-to-image, or export** -> stay in `read-pdf`.
- **Deep paper analysis or reproduction judgment** -> hand off to `paper-analyst` after the needed pages are loaded.
- **Reviewer-style assessment** -> hand off to `paper-review`.
- **Related work, novelty search, or paper shortlist** -> hand off to `paper-search` only when the user explicitly asks, and use access labels before attempting full-text reading.
- **Citation insertion, BibTeX export, references.bib sync, or Zotero import** -> use the official Zotero plugin.
- **LaTeX build, TeX diagnostics, or PDF regeneration from `.tex`** -> use the official LaTeX plugin.

## Trigger Boundary

This skill is for raw PDF interaction only.

Turn it on for prompts like:

- "Read this PDF"
- "Look at page 8"
- "Search for Navier-Stokes in the paper"
- "Render the page with Figure 3"
- "Read the PDF attached to this Zotero item"
- "Find the Zotero PDF for this DOI and inspect page 6"

Do **not** expand into literature search, citation management, LaTeX compilation, or full paper critique unless the user explicitly asks for those next.

## Run Command

Prefer the bundled wrapper from this skill directory:

```bash
{{WRAPPER_COMMAND}}
```

Equivalent manual form when needed:

```bash
{{MANUAL_COMMAND}}
```

## Zotero Attachment Path Fallback

Prefer the official Zotero plugin when available:

```bash
python3 <zotero-plugin-root>/skills/zotero/scripts/zotero.py status --json
python3 <zotero-plugin-root>/skills/zotero/scripts/zotero.py search "paper title or DOI" --json
python3 <zotero-plugin-root>/skills/zotero/scripts/zotero.py children <item-key> --json
python3 <zotero-plugin-root>/skills/zotero/scripts/zotero.py file-url <attachment-key>
```

If the official plugin is unavailable and only a local Zotero PDF attachment path is needed, use the fallback helper:

```bash
python3 scripts/zotero_pdf.py --doi "10.xxxx/xxxxx" --print-path
python3 scripts/zotero_pdf.py "paper title" --format json
bash scripts/run_read_pdf.sh "$(python3 scripts/zotero_pdf.py --doi "10.xxxx/xxxxx" --print-path)" --page 3
```

The fallback helper is read-only. It queries Zotero's local API at `127.0.0.1:23119`, exact-matches DOI searches before returning a PDF, and never imports or modifies Zotero items.

## Access-Aware Paper Reading

For research workflows that start from a title, DOI, URL, or search result, use these labels before deciding how to read:

- `zotero_pdf`: already in Zotero with a local PDF attachment. Resolve the path and read it through `read-pdf`.
- `oa_pdf`: a legal open-access PDF exists. Read it as a temp artifact unless the user asks to save it.
- `html_fulltext`: publisher, preprint, or journal HTML contains enough full text. Read the web page directly when possible.
- `abstract_only`: only metadata or abstract is available. Do not make high-confidence full-paper judgments.
- `needs_user_pdf`: full text requires login, paywall access, manual download, or user-side Zotero Connector save.

If publisher PDF download fails because of permissions, Cloudflare, login state, or signed URLs, do not treat that as a reason to bypass access controls. Try legal OA, arXiv, author manuscript, existing Zotero attachments, or ask the user to provide/save the PDF.

## Auto Mode Selection

Do not ask the user to provide flags unless the request is truly ambiguous. Infer the mode from the request:

- If the PDF text is already present in context and the request is light-weight, answer directly without forcing the wrapper.
- Plain reading, summaries, quotes, TOC, keyword search, or targeted page extraction: use normal text extraction first.
- If the PDF page is scanned, image-only, or extracted text is obviously missing/incomplete: add `--ocr auto`.
- If the user explicitly asks to read a scan or image-heavy page and text extraction is failing: use `--ocr force`.
- If the user asks about figures, tables, charts, diagrams, or layout: render the target pages to PNG and inspect those rendered images directly.
- For tables/charts with small labels: use a hybrid workflow: render the page for visual structure and also run text extraction or OCR on the same page.
- For full-text export on likely scanned PDFs: use `--all --ocr auto`.
- For a Zotero-backed request: resolve the local PDF path first, then apply the same mode selection rules to that file.

Quick request-to-mode mapping:

- **"Read page X / quote a section / search a keyword"** -> if native PDF context already shows enough, answer directly; otherwise use text extraction first and add `--ocr auto` only if extraction is weak.
- **"This page looks scanned / OCR it"** -> `--page` or `--pages` with `--ocr auto` or `--ocr force`.
- **"Check a figure / table / architecture diagram / render the page"** -> `--render-page` or `--render-pages`, then inspect the PNG output directly.
- **"Export the whole paper"** -> `--all`, and add `--ocr auto` for likely scanned PDFs.

## Common Options

- No option: print PDF metadata and the first 3 pages.
- `--page 3`: print one page.
- `--pages 1-5` or `--pages 1,3,8`: print selected pages.
- `--search "keyword" [--ignore-case]`: print pages that contain the keyword after the selected extraction/OCR path.
- `--figures`: extract likely figure/table captions from page text; this is caption heuristics, not figure cropping.
- `--toc`: print embedded table of contents.
- `--all [--output <path>]`: export all pages to text. Without `--output`, files go to a deterministic cache directory in the system temp area, and a page-scoped `.pages.jsonl` plus a `.manifest.json` are written alongside the main `.txt`.
- `--render-page 3 [--output <path>]`: render one page to PNG. Without `--output`, files go to a per-run directory in the system temp area.
- `--render-pages 10-12 [--output <dir>]`: render selected pages to PNG files. Without `--output`, files go to a per-run directory in the system temp area.
- `--ocr auto|force`: enable OCR when needed.
- `--ocr-lang chi_sim+eng`: use Chinese + English OCR when the language pack exists.
- `--ocr-dpi 300`: raise OCR render resolution for small or blurry text.
- `--ocr-full`: force full-page OCR instead of image-only OCR when needed.
- `--ocr-min-chars 80`: tune when auto OCR should kick in on low-text pages.
- `--tessdata <dir>`: point to a non-default Tesseract language-data directory.
- `--render-dpi 220`: raise PNG quality for figure/table inspection.
- `--max-chars 0`: disable per-page output truncation.
- `--keep-temp`: keep default temp outputs out of the script's TTL pruning. Note: system temp may still be purged by the OS.
- `--no-prune`: skip stale temp-output cleanup for the current run.

## Workflow

1. Resolve the PDF path with quotes if it contains spaces.
2. If the source is a Zotero item, use the official Zotero plugin first; fall back to `scripts/zotero_pdf.py` only for read-only attachment path resolution.
3. Narrow scope first with `--page`, `--pages`, `--search`, or `--toc` unless the user explicitly wants the whole document.
4. Use plain extraction first for native-text PDFs.
5. Switch to `--ocr auto` only when the page is scanned or the extracted text is clearly incomplete.
6. For figures/tables/charts, render the relevant page(s) to PNG and inspect the image output directly instead of relying on OCR alone.
7. By default, write generated text files, renders, OCR outputs, and scratch artifacts to deterministic cache paths in the system temp area rather than the user's project directory.
8. Before regenerating default temp outputs, the script first checks for an existing matching cached output and reuses it when present.
9. Default full-text exports also create machine-oriented sidecars (`.pages.jsonl` and `.manifest.json`) so AI tools can reuse page-scoped text without reparsing the raw `.txt`.
10. The script prunes stale `read-pdf` temp directories automatically with a TTL-based cleanup pass and an overall size cap; if the current task created temp artifacts, clean them up when the task is done unless the user explicitly asks to keep them.
11. If the user explicitly wants to keep an export or render, pass `--output` to a deliberate destination and mention the absolute saved path.
12. If output is long, summarize key findings and mention where any kept text or PNG files were saved.

## Output Discipline

- Always mention the page number(s) used for the answer.
- If OCR changed the answer quality, say whether the page was read as `text`, `ocr`, `ocr-full`, or `text-fallback`.
- If `--figures` returns nothing, do not infer that the PDF has no figures; it only means no likely captions were found in extracted text.
- If a rendered page is central to the answer, mention the absolute PNG path when the file is kept.
- For Zotero-backed reads, mention whether the PDF came from `zotero_pdf` and include the resolved local path when useful.

## Notes

- PyMuPDF extraction may lose layout fidelity on complex PDFs.
- OCR here uses PyMuPDF's Tesseract integration, so accuracy depends on scan quality, DPI, and installed Tesseract language packs.
- For Chinese OCR, make sure Tesseract language data like `chi_sim` is installed; otherwise prefer rendered-page inspection for visual understanding.
- OCR is slower than normal text extraction, so prefer it only when it adds value.
- Unless the user explicitly requests saved exports, treat all generated files as disposable task-local cache in the system temp directory.
- The official Zotero plugin is the preferred tool for citations and library operations. The fallback helper in this skill exists only to bridge local Zotero PDF attachments into PDF reading.
