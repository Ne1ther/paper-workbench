#!/usr/bin/env python3
"""Read PDF files with PyMuPDF for large-document workflows."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import fitz


FIGURE_CAPTION_PATTERN = re.compile(
    r"(?:Fig(?:ure)?\.?|Table|图|表)\s*\d+[\.:：-]?[^\n]*(?:\n(?!\s*$)[^\n]*){0,2}",
    re.IGNORECASE,
)
TEMP_OUTPUT_PREFIX = "codex-read-pdf-tmp-"
KEEP_TEMP_OUTPUT_PREFIX = "codex-read-pdf-keep-"
LEGACY_TEMP_OUTPUT_PREFIX = "codex-read-pdf-"
TEMP_RETENTION_SECONDS = 24 * 60 * 60
TEMP_MAX_BYTES = 512 * 1024 * 1024


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

    return [page for page in sorted(pages) if 1 <= page <= page_count]


def clip_text(text: str, max_chars: int) -> str:
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


def cleanup_stale_temp_outputs() -> None:
    """Best-effort cleanup for old read-pdf temp directories in the system temp area."""
    temp_root = Path(tempfile.gettempdir())
    cutoff = time.time() - TEMP_RETENTION_SECONDS
    for prefix in (TEMP_OUTPUT_PREFIX, LEGACY_TEMP_OUTPUT_PREFIX):
        for path in temp_root.glob(f"{prefix}*"):
            if path.name.startswith(KEEP_TEMP_OUTPUT_PREFIX):
                continue
            try:
                if path.stat().st_mtime >= cutoff:
                    continue
            except OSError:
                continue

            try:
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    path.unlink(missing_ok=True)
            except OSError:
                continue

    enforce_temp_size_cap(temp_root)


def allocate_temp_output_root(keep_temp: bool = False) -> Path:
    prefix = KEEP_TEMP_OUTPUT_PREFIX if keep_temp else TEMP_OUTPUT_PREFIX
    return Path(tempfile.mkdtemp(prefix=prefix))


def iter_managed_temp_paths(temp_root: Path) -> list[Path]:
    managed: list[Path] = []
    for prefix in (TEMP_OUTPUT_PREFIX, LEGACY_TEMP_OUTPUT_PREFIX):
        for path in temp_root.glob(f"{prefix}*"):
            if path.name.startswith(KEEP_TEMP_OUTPUT_PREFIX):
                continue
            managed.append(path)
    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in managed:
        if path in seen or not path.exists():
            continue
        seen.add(path)
        deduped.append(path)
    return deduped


def path_size_bytes(path: Path) -> int:
    try:
        if path.is_file():
            return path.stat().st_size
        total = 0
        for child in path.rglob("*"):
            try:
                if child.is_file():
                    total += child.stat().st_size
            except OSError:
                continue
        return total
    except OSError:
        return 0


def enforce_temp_size_cap(temp_root: Path) -> None:
    managed = iter_managed_temp_paths(temp_root)
    total = sum(path_size_bytes(path) for path in managed)
    if total <= TEMP_MAX_BYTES:
        return

    # Remove least-recently-used caches first until usage drops under the cap.
    managed.sort(key=lambda path: path.stat().st_mtime if path.exists() else 0.0)
    for path in managed:
        if total <= TEMP_MAX_BYTES:
            break
        size = path_size_bytes(path)
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)
            total -= size
        except OSError:
            continue


def build_cache_key(pdf_path: Path, mode: str, extra: dict[str, object] | None = None) -> str:
    stat = pdf_path.stat()
    payload = {
        "pdf_path": str(pdf_path),
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
        "mode": mode,
        "extra": extra or {},
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()
    return digest[:16]


def build_named_temp_root(cache_key: str, keep_temp: bool) -> Path:
    prefix = KEEP_TEMP_OUTPUT_PREFIX if keep_temp else TEMP_OUTPUT_PREFIX
    return Path(tempfile.gettempdir()) / f"{prefix}{cache_key}"


def existing_temp_roots(cache_key: str) -> list[Path]:
    temp_root = Path(tempfile.gettempdir())
    candidates = [
        temp_root / f"{KEEP_TEMP_OUTPUT_PREFIX}{cache_key}",
        temp_root / f"{TEMP_OUTPUT_PREFIX}{cache_key}",
        temp_root / f"{LEGACY_TEMP_OUTPUT_PREFIX}{cache_key}",
    ]
    seen: set[Path] = set()
    result: list[Path] = []
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        if path.exists():
            result.append(path)
    return result


def touch_path(path: Path) -> None:
    try:
        if path.exists():
            os.utime(path, None)
    except OSError:
        pass


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slim_pdf_metadata(doc: fitz.Document) -> dict[str, str]:
    meta = doc.metadata or {}
    return {
        "title": meta.get("title") or "",
        "author": meta.get("author") or "",
        "subject": meta.get("subject") or "",
    }


class PDFReader:
    def __init__(self, doc: fitz.Document, args: argparse.Namespace) -> None:
        self.doc = doc
        self.args = args
        self.analysis_cache: dict[int, dict[str, int]] = {}
        self.ocr_cache: dict[int, tuple[str, bool]] = {}
        self.tesseract_languages: set[str] | None = None
        self.ocr_warning_printed = False

    def analyze_page(self, page_number: int) -> dict[str, int]:
        cached = self.analysis_cache.get(page_number)
        if cached is not None:
            return cached

        page = self.doc[page_number - 1]
        text = page.get_text("text").strip()
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_IMAGES).get("blocks", [])
        text_blocks = sum(1 for block in blocks if block.get("type") == 0)
        image_blocks = sum(1 for block in blocks if block.get("type") == 1)
        analysis = {
            "text_chars": len(text),
            "text_blocks": text_blocks,
            "image_blocks": image_blocks,
        }
        self.analysis_cache[page_number] = analysis
        return analysis

    def get_available_tesseract_languages(self) -> set[str]:
        if self.tesseract_languages is not None:
            return self.tesseract_languages
        try:
            result = subprocess.run(
                ["tesseract", "--list-langs"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            self.tesseract_languages = set()
            return self.tesseract_languages

        langs: set[str] = set()
        for line in result.stdout.splitlines():
            value = line.strip()
            if not value or value.startswith("List of available languages"):
                continue
            langs.add(value)
        self.tesseract_languages = langs
        return langs

    def warn_missing_ocr_languages(self) -> None:
        if self.args.ocr == "off" or self.ocr_warning_printed:
            return
        available = self.get_available_tesseract_languages()
        if not available:
            return
        requested = [lang.strip() for lang in self.args.ocr_lang.split("+") if lang.strip()]
        missing = [lang for lang in requested if lang not in available]
        if missing:
            available_list = ", ".join(sorted(available))
            missing_list = ", ".join(missing)
            print(
                f"Warning: missing Tesseract languages: {missing_list}. Available: {available_list}",
                file=sys.stderr,
            )
            self.ocr_warning_printed = True

    def should_ocr(self, analysis: dict[str, int]) -> bool:
        if self.args.ocr == "force":
            return True
        if self.args.ocr != "auto":
            return False
        if analysis["text_chars"] == 0:
            return True
        if analysis["text_chars"] < self.args.ocr_min_chars and (
            analysis["image_blocks"] > 0 or analysis["text_blocks"] == 0
        ):
            return True
        return False

    def build_ocr_text(self, page_number: int, analysis: dict[str, int]) -> tuple[str, bool]:
        cached = self.ocr_cache.get(page_number)
        if cached is not None:
            return cached

        self.warn_missing_ocr_languages()
        page = self.doc[page_number - 1]
        full_page = self.args.ocr_full or analysis["image_blocks"] == 0
        kwargs = {
            "language": self.args.ocr_lang,
            "dpi": self.args.ocr_dpi,
            "full": full_page,
        }
        tessdata = self.args.tessdata
        if tessdata is not None:
            kwargs["tessdata"] = str(tessdata)
        else:
            auto_tessdata = fitz.get_tessdata()
            if auto_tessdata:
                kwargs["tessdata"] = auto_tessdata

        textpage = page.get_textpage_ocr(**kwargs)
        text = page.get_text("text", textpage=textpage).strip()
        cached = (text, full_page)
        self.ocr_cache[page_number] = cached
        return cached

    def extract_page_text(self, page_number: int) -> tuple[str, str, dict[str, int]]:
        page = self.doc[page_number - 1]
        analysis = self.analyze_page(page_number)
        mode = "text"
        text = page.get_text("text").strip()

        if self.should_ocr(analysis):
            try:
                text, full_page = self.build_ocr_text(page_number, analysis)
                mode = "ocr-full" if full_page else "ocr"
            except Exception as exc:
                mode = "text-fallback"
                print(f"Warning: OCR failed on page {page_number}: {exc}", file=sys.stderr)

        return text, mode, analysis


def show_default_preview(reader: PDFReader, path: Path, max_chars: int) -> None:
    print_pdf_info(reader.doc, path)
    preview_pages = min(3, reader.doc.page_count)
    show_selected_pages(reader, list(range(1, preview_pages + 1)), max_chars)


def show_selected_pages(reader: PDFReader, pages: list[int], max_chars: int) -> None:
    if not pages:
        print("No valid pages selected.")
        return
    for page in pages:
        text, mode, _ = reader.extract_page_text(page)
        print(f"\n=== Page {page} [{mode}] ===")
        print(clip_text(text, max_chars) or "[empty]")


def search_keyword(reader: PDFReader, keyword: str, max_chars: int, ignore_case: bool) -> None:
    needle = keyword.lower() if ignore_case else keyword
    hits = 0
    for page_number in range(1, reader.doc.page_count + 1):
        text, mode, _ = reader.extract_page_text(page_number)
        source = text.lower() if ignore_case else text
        if needle in source:
            hits += 1
            print(f"\n=== Page {page_number} [{mode}] ===")
            print(clip_text(text, max_chars) or "[empty]")
    if hits == 0:
        print(f"No pages matched keyword: {keyword}")


def extract_figure_captions(reader: PDFReader) -> None:
    matches = 0
    for page_number in range(1, reader.doc.page_count + 1):
        text, _, _ = reader.extract_page_text(page_number)
        for raw in FIGURE_CAPTION_PATTERN.findall(text):
            cleaned = " ".join(raw.split())
            if cleaned:
                matches += 1
                print(f"[Page {page_number}] {cleaned}")
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


def dump_all_text(reader: PDFReader, pdf_path: Path, output: Path | None) -> None:
    output = normalize_output_path(output)
    cache_key = None
    if output is None:
        cache_key = build_cache_key(
            pdf_path,
            "all",
            {
                "ocr": reader.args.ocr,
                "ocr_lang": reader.args.ocr_lang,
                "ocr_dpi": reader.args.ocr_dpi,
                "ocr_full": reader.args.ocr_full,
                "ocr_min_chars": reader.args.ocr_min_chars,
                "tessdata": str(reader.args.tessdata) if reader.args.tessdata else None,
            },
        )
        out_path = None
        for root in existing_temp_roots(cache_key):
            candidate = root / f"{pdf_path.stem}.txt"
            if candidate.exists():
                touch_path(root)
                touch_path(candidate)
                print(f"Using cached full text: {candidate}")
                return
        out_path = build_named_temp_root(cache_key, reader.args.keep_temp) / f"{pdf_path.stem}.txt"
    else:
        out_path = output

    out_path.parent.mkdir(parents=True, exist_ok=True)
    page_records_path = out_path.with_suffix(".pages.jsonl")
    manifest_path = out_path.with_suffix(".manifest.json")
    pages_written = 0
    mode_counts: dict[str, int] = {}
    with out_path.open("w", encoding="utf-8") as handle:
        with page_records_path.open("w", encoding="utf-8") as page_handle:
            for page_number in range(1, reader.doc.page_count + 1):
                text, mode, analysis = reader.extract_page_text(page_number)
                pages_written += 1
                mode_counts[mode] = mode_counts.get(mode, 0) + 1
                record = {
                    "page": page_number,
                    "mode": mode,
                    "text": text,
                    "text_chars": analysis["text_chars"],
                    "text_blocks": analysis["text_blocks"],
                    "image_blocks": analysis["image_blocks"],
                }
                page_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                handle.write(f"=== Page {page_number} [{mode}] ===\n")
                handle.write(text)
                handle.write("\n\n")
    manifest = {
        "kind": "read-pdf-full-text-cache",
        "cache_key": cache_key,
        "pdf_path": str(pdf_path),
        "pdf_metadata": slim_pdf_metadata(reader.doc),
        "pdf_mtime_ns": pdf_path.stat().st_mtime_ns,
        "pdf_size": pdf_path.stat().st_size,
        "page_count": reader.doc.page_count,
        "created_at": int(time.time()),
        "mode_counts": mode_counts,
        "artifacts": {
            "full_text": str(out_path),
            "pages_jsonl": str(page_records_path),
        },
        "pages_written": pages_written,
        "optimized_for": "machine-readable page-scoped reuse",
    }
    write_json(manifest_path, manifest)
    print(f"Wrote full text to: {out_path}")
    print(f"Wrote page records to: {page_records_path}")
    print(f"Wrote manifest to: {manifest_path}")


def normalize_output_path(path: Path | None) -> Path | None:
    if path is None:
        return None
    return path.expanduser()


def render_pages(
    doc: fitz.Document,
    pdf_path: Path,
    pages: list[int],
    output: Path | None,
    render_dpi: int,
    keep_temp: bool,
) -> None:
    if not pages:
        print("No valid pages selected for rendering.")
        return

    scale = render_dpi / 72
    output = normalize_output_path(output)
    single_custom_file = output and len(pages) == 1 and output.suffix.lower() == ".png"
    temp_root = None

    if output is None:
        cache_key = build_cache_key(
            pdf_path,
            "render",
            {
                "render_dpi": render_dpi,
            },
        )
        existing_roots = existing_temp_roots(cache_key)
        expected_names = {
            page_number: f"{pdf_path.stem}.page-{page_number}.png" for page_number in pages
        }
        for root in existing_roots:
            render_dir = root / "renders"
            if all((render_dir / name).exists() for name in expected_names.values()):
                touch_path(root)
                touch_path(render_dir)
                for page_number in pages:
                    candidate = render_dir / expected_names[page_number]
                    touch_path(candidate)
                    print(f"Using cached render: {candidate}")
                return
        temp_root = build_named_temp_root(cache_key, keep_temp=keep_temp)

    if single_custom_file:
        output.parent.mkdir(parents=True, exist_ok=True)
        targets = {pages[0]: output}
    else:
        output_dir = output or temp_root / "renders"
        output_dir.mkdir(parents=True, exist_ok=True)
        targets = {
            page_number: output_dir / f"{pdf_path.stem}.page-{page_number}.png" for page_number in pages
        }

    for page_number in pages:
        page = doc[page_number - 1]
        target = targets[page_number]
        if target.exists():
            print(f"Using cached render: {target}")
            continue
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pixmap.save(target)
        print(f"Wrote render to: {target}")


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
    group.add_argument("--render-page", type=int, help="Render one page to PNG")
    group.add_argument("--render-pages", help="Render page ranges to PNG")

    parser.add_argument("--output", type=Path, help="Output path when using --all or render modes")
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep default temp outputs out of TTL pruning (system temp may still be cleaned by the OS)",
    )
    parser.add_argument(
        "--no-prune",
        action="store_true",
        help="Skip stale temp-output cleanup for this run",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=6000,
        help="Max chars per printed page (0 for no limit)",
    )
    parser.add_argument("--ignore-case", action="store_true", help="Case-insensitive search")
    parser.add_argument(
        "--ocr",
        choices=["off", "auto", "force"],
        default="off",
        help="OCR mode: off, auto for low-text pages, or force",
    )
    parser.add_argument(
        "--ocr-lang",
        default="eng",
        help="Tesseract language(s), e.g. eng or chi_sim+eng",
    )
    parser.add_argument("--ocr-dpi", type=int, default=300, help="Rendering DPI used for OCR")
    parser.add_argument(
        "--ocr-full",
        action="store_true",
        help="Force full-page OCR instead of image-only OCR when possible",
    )
    parser.add_argument(
        "--ocr-min-chars",
        type=int,
        default=80,
        help="In auto mode, OCR pages with fewer than this many text chars",
    )
    parser.add_argument(
        "--tessdata",
        type=Path,
        help="Optional Tesseract tessdata directory; defaults to PyMuPDF/TESSDATA_PREFIX discovery",
    )
    parser.add_argument("--render-dpi", type=int, default=220, help="Rendering DPI for PNG output")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if not args.no_prune:
        cleanup_stale_temp_outputs()
    pdf_path = Path(args.pdf_path).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    if args.tessdata is not None:
        args.tessdata = args.tessdata.expanduser()

    doc = fitz.open(pdf_path)
    try:
        reader = PDFReader(doc, args)
        if args.render_page is not None:
            render_pages(doc, pdf_path, [args.render_page], args.output, args.render_dpi, args.keep_temp)
        elif args.render_pages:
            render_pages(
                doc,
                pdf_path,
                parse_page_ranges(args.render_pages, doc.page_count),
                args.output,
                args.render_dpi,
                args.keep_temp,
            )
        elif args.page is not None:
            show_selected_pages(reader, [args.page], args.max_chars)
        elif args.pages:
            show_selected_pages(reader, parse_page_ranges(args.pages, doc.page_count), args.max_chars)
        elif args.search:
            search_keyword(reader, args.search, args.max_chars, args.ignore_case)
        elif args.figures:
            extract_figure_captions(reader)
        elif args.toc:
            show_toc(doc)
        elif args.all:
            dump_all_text(reader, pdf_path, args.output)
        else:
            show_default_preview(reader, pdf_path, args.max_chars)
    finally:
        doc.close()


if __name__ == "__main__":
    main()
