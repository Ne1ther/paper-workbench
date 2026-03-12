---
name: read-pdf
description: Read and inspect PDF files with PyMuPDF, including large PDFs, scanned PDFs, and figure/table-heavy pages. Use when a user asks to read a PDF, extract specific pages, search text, inspect figures or tables, print table of contents, render pages to images, or export full PDF text.
---

# Read PDF

Use the bundled script to read PDF files reliably, then choose text extraction, OCR, or rendered-page inspection based on the user's intent.

## Run Command

Always run from this skill directory:

```bash
{{RUN_COMMAND}}
```

## Auto Mode Selection

Do not ask the user to provide flags unless the request is truly ambiguous. Infer the mode from the request:

- Plain reading, summaries, quotes, TOC, keyword search, or targeted page extraction: use normal text extraction first.
- If the PDF page is scanned, image-only, or extracted text is obviously missing/incomplete: add `--ocr auto`.
- If the user explicitly asks to read a scan or image-heavy page and text extraction is failing: use `--ocr force`.
- If the user asks about figures, tables, charts, diagrams, or layout: render the target pages to PNG and inspect those rendered images directly.
- For tables/charts with small labels: use a hybrid workflow: render the page for visual structure and also run text extraction or OCR on the same page.
- For full-text export on likely scanned PDFs: use `--all --ocr auto`.

## Common Options

- No option: print PDF metadata and the first 3 pages.
- `--page 3`: print one page.
- `--pages 1-5` or `--pages 1,3,8`: print selected pages.
- `--search "keyword" [--ignore-case]`: print pages that contain the keyword.
- `--figures`: extract likely figure/table captions.
- `--toc`: print embedded table of contents.
- `--all [--output ./full_text.txt]`: export all pages to text.
- `--render-page 3 [--output ./page-3.png]`: render one page to PNG.
- `--render-pages 10-12 [--output ./renders/]`: render selected pages to PNG files.
- `--ocr auto|force`: enable OCR when needed.
- `--ocr-lang chi_sim+eng`: use Chinese + English OCR when the language pack exists.
- `--max-chars 0`: disable per-page output truncation.

## Workflow

1. Resolve the PDF path with quotes if it contains spaces.
2. Narrow scope first with `--page`, `--pages`, or `--search` unless the user explicitly wants the whole document.
3. Use plain extraction first for native-text PDFs.
4. Switch to `--ocr auto` only when the page is scanned or the extracted text is clearly incomplete.
5. For figures/tables/charts, render the relevant page(s) to PNG and inspect the image output directly instead of relying on OCR alone.
6. If output is long, summarize key findings and mention where any text or PNG files were saved.

## Notes

- PyMuPDF extraction may lose layout fidelity on complex PDFs.
- OCR here uses PyMuPDF's Tesseract integration, so accuracy depends on scan quality, DPI, and installed Tesseract language packs.
- For Chinese OCR, make sure Tesseract language data like `chi_sim` is installed; otherwise prefer rendered-page inspection for visual understanding.
- OCR is slower than normal text extraction, so prefer it only when it adds value.
