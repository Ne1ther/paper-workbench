#!/usr/bin/env python3
"""Read PDF files with PyMuPDF for large-document workflows."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import fitz


def parse_page_ranges(spec: str, page_count: int) -> list[int]:
    pages: set[int] = set()
    for part in spec.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_str, end_str = token.split("-", 1)
            start = int(start_str)
            end = int(end_str)
            if start > end:
                start, end = end, start
            pages.update(range(start, end + 1))
        else:
            pages.add(int(token))

    cleaned: list[int] = []
    for page in sorted(pages):
        if 1 <= page <= page_count:
            cleaned.append(page)
    return cleaned


def get_page_text(doc: fitz.Document, page_number: int, max_chars: int) -> str:
    text = doc[page_number - 1].get_text().strip()
    if max_chars > 0 and len(text) > max_chars:
        return f"{text[:max_chars]}\n... [truncated {len(text) - max_chars} chars]"
    return text


def print_pdf_info(doc: fitz.Document, path: Path) -> None:
    meta = doc.metadata or {}
    print(f"File: {path}")
    print(f"Pages: {doc.page_count}")
    print(f"Title: {meta.get('title') or 'N/A'}")
    print(f"Author: {meta.get('author') or 'N/A'}")
    print(f"Subject: {meta.get('subject') or 'N/A'}")


def show_default_preview(doc: fitz.Document, path: Path, max_chars: int) -> None:
    print_pdf_info(doc, path)
    preview_pages = min(3, doc.page_count)
    for page in range(1, preview_pages + 1):
        print(f"\n=== Page {page} ===")
        print(get_page_text(doc, page, max_chars) or "[empty]")


def show_selected_pages(doc: fitz.Document, pages: list[int], max_chars: int) -> None:
    if not pages:
        print("No valid pages selected.")
        return
    for page in pages:
        print(f"\n=== Page {page} ===")
        print(get_page_text(doc, page, max_chars) or "[empty]")


def search_keyword(doc: fitz.Document, keyword: str, max_chars: int, ignore_case: bool) -> None:
    needle = keyword.lower() if ignore_case else keyword
    hits = 0
    for page in range(1, doc.page_count + 1):
        text = doc[page - 1].get_text()
        source = text.lower() if ignore_case else text
        if needle in source:
            hits += 1
            clipped = text.strip()
            if max_chars > 0 and len(clipped) > max_chars:
                clipped = f"{clipped[:max_chars]}\n... [truncated {len(clipped) - max_chars} chars]"
            print(f"\n=== Page {page} ===")
            print(clipped or "[empty]")
    if hits == 0:
        print(f"No pages matched keyword: {keyword}")


def extract_figure_captions(doc: fitz.Document) -> None:
    pattern = re.compile(
        r"(?:Fig(?:ure)?\.?|Table|图|表)\s*\d+[\.:：-]?[^\n]*(?:\n(?!\s*$)[^\n]*){0,2}",
        re.IGNORECASE,
    )
    matches = 0
    for page in range(1, doc.page_count + 1):
        text = doc[page - 1].get_text()
        for raw in pattern.findall(text):
            cleaned = " ".join(raw.split())
            if cleaned:
                matches += 1
                print(f"[Page {page}] {cleaned}")
    if matches == 0:
        print("No figure/table captions found.")


def show_toc(doc: fitz.Document) -> None:
    toc = doc.get_toc(simple=False)
    if not toc:
        print("No table of contents embedded in this PDF.")
        return
    for item in toc:
        level, title, page, *_ = item
        indent = "  " * max(level - 1, 0)
        print(f"{indent}- p.{page} {title}")


def dump_all_text(doc: fitz.Document, pdf_path: Path, output: Path | None) -> None:
    out_path = output or pdf_path.with_suffix(".txt")
    with out_path.open("w", encoding="utf-8") as handle:
        for page in range(1, doc.page_count + 1):
            handle.write(f"=== Page {page} ===\n")
            handle.write(doc[page - 1].get_text())
            handle.write("\n\n")
    print(f"Wrote full text to: {out_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read PDF files with PyMuPDF")
    parser.add_argument("pdf_path", help="Path to the PDF file")

    group = parser.add_mutually_exclusive_group()
    group.add_argument("--page", type=int, help="Read one page (1-based)")
    group.add_argument("--pages", help="Read page ranges, e.g. 1-5 or 1,3,8")
    group.add_argument("--search", help="Search keyword and print matching pages")
    group.add_argument("--figures", action="store_true", help="Extract figure/table captions")
    group.add_argument("--toc", action="store_true", help="Print table of contents")
    group.add_argument("--all", action="store_true", help="Dump all text to a file")

    parser.add_argument("--output", type=Path, help="Output .txt path when using --all")
    parser.add_argument("--max-chars", type=int, default=6000, help="Max chars per printed page (0 for no limit)")
    parser.add_argument("--ignore-case", action="store_true", help="Case-insensitive search")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    pdf_path = Path(args.pdf_path).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    doc = fitz.open(pdf_path)
    try:
        if args.page is not None:
            show_selected_pages(doc, [args.page], args.max_chars)
        elif args.pages:
            pages = parse_page_ranges(args.pages, doc.page_count)
            show_selected_pages(doc, pages, args.max_chars)
        elif args.search:
            search_keyword(doc, args.search, args.max_chars, args.ignore_case)
        elif args.figures:
            extract_figure_captions(doc)
        elif args.toc:
            show_toc(doc)
        elif args.all:
            dump_all_text(doc, pdf_path, args.output)
        else:
            show_default_preview(doc, pdf_path, args.max_chars)
    finally:
        doc.close()


if __name__ == "__main__":
    main()
