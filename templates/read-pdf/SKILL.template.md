---
name: read-pdf
description: Read and inspect PDF files with PyMuPDF, including large PDFs that exceed built-in read limits. Use when a user asks to read a PDF, extract specific pages, search text in a PDF, list figure captions, print table of contents, or export full PDF text to a .txt file.
---

# Read PDF

Use the bundled script to read PDF files reliably.

## Run Command

Always run from this skill directory:

```bash
{{RUN_COMMAND}}
```

## Common Options

- No option: print PDF metadata and the first 3 pages.
- `--page 3`: print one page.
- `--pages 1-5` or `--pages 1,3,8`: print selected pages.
- `--search "keyword" [--ignore-case]`: print pages that contain the keyword.
- `--figures`: extract likely figure/table captions.
- `--toc`: print embedded table of contents.
- `--all [--output ./full_text.txt]`: export all pages to text.
- `--max-chars 0`: disable per-page output truncation.

## Workflow

1. Resolve the PDF path with quotes if it contains spaces.
2. Pick the narrowest option first (`--page`, `--pages`, `--search`) to avoid huge output.
3. Use `--all` only when the user explicitly wants complete extraction.
4. If output is long, summarize key findings and mention where full text was saved.

## Notes

- PyMuPDF extraction may lose layout fidelity on complex PDFs.
- Scanned/image-only PDFs may require OCR (not included in this skill).
