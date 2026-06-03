#!/usr/bin/env python3
"""Resolve local Zotero PDF attachments for read-pdf workflows."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


DEFAULT_ZOTERO_API = "http://127.0.0.1:23119/api/users/0"
DEFAULT_ZOTERO_STORAGE = Path.home() / "Zotero" / "storage"
REQUEST_TIMEOUT = 8


@dataclass
class ResolvedAttachment:
    parent_key: str | None
    attachment_key: str
    title: str
    item_type: str
    year: str | None
    doi: str | None
    publication_title: str | None
    path: str
    content_type: str | None


def zotero_json(url: str, params: dict[str, object] | None = None) -> Any:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
    request = urllib.request.Request(url, headers={"Zotero-API-Version": "3"})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def as_year(date_value: str | None) -> str | None:
    if not date_value:
        return None
    for token in date_value.replace("/", "-").split("-"):
        if len(token) == 4 and token.isdigit():
            return token
    return date_value[:4] if len(date_value) >= 4 else date_value


def normalize_doi(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    value = value.removeprefix("https://doi.org/")
    value = value.removeprefix("http://doi.org/")
    value = value.removeprefix("doi:")
    return value.strip()


def file_url_to_path(href: str | None) -> Path | None:
    if not href or not href.startswith("file://"):
        return None
    return Path(urllib.parse.unquote(href.removeprefix("file://"))).expanduser()


def storage_path_from_attachment(item: dict[str, Any], storage_root: Path) -> Path | None:
    data = item.get("data") or {}
    path_value = data.get("path")
    key = data.get("key") or item.get("key")
    if not isinstance(path_value, str) or not path_value or not isinstance(key, str):
        return None
    if path_value.startswith("storage:"):
        return storage_root / key / path_value.removeprefix("storage:")
    candidate = Path(path_value).expanduser()
    return candidate if candidate.is_absolute() else None


def local_pdf_path(item: dict[str, Any], storage_root: Path) -> Path | None:
    enclosure = (item.get("links") or {}).get("enclosure") or {}
    candidate = file_url_to_path(enclosure.get("href"))
    if candidate and candidate.exists() and candidate.suffix.lower() == ".pdf":
        return candidate
    candidate = storage_path_from_attachment(item, storage_root)
    if candidate and candidate.exists() and candidate.suffix.lower() == ".pdf":
        return candidate
    return None


def fetch_item(api_base: str, key_or_url: str) -> dict[str, Any]:
    if key_or_url.startswith("http://") or key_or_url.startswith("https://"):
        return zotero_json(key_or_url)
    return zotero_json(f"{api_base.rstrip('/')}/items/{urllib.parse.quote(key_or_url)}")


def fetch_children(api_base: str, item_key: str) -> list[dict[str, Any]]:
    return zotero_json(
        f"{api_base.rstrip('/')}/items/{urllib.parse.quote(item_key)}/children",
        {"include": "data", "limit": 100},
    )


def resolve_attachment_item(
    item: dict[str, Any],
    api_base: str,
    storage_root: Path,
    parent: dict[str, Any] | None = None,
) -> list[ResolvedAttachment]:
    data = item.get("data") or {}
    item_type = data.get("itemType") or ""
    if item_type == "attachment":
        path = local_pdf_path(item, storage_root)
        if not path:
            return []
        parent_data = (parent or {}).get("data") or {}
        return [
            ResolvedAttachment(
                parent_key=parent_data.get("key") or data.get("parentItem"),
                attachment_key=data.get("key") or item.get("key") or "",
                title=parent_data.get("title") or data.get("title") or "",
                item_type=parent_data.get("itemType") or item_type,
                year=as_year(parent_data.get("date") or data.get("date")),
                doi=parent_data.get("DOI") or data.get("DOI"),
                publication_title=parent_data.get("publicationTitle") or data.get("publicationTitle"),
                path=str(path),
                content_type=data.get("contentType"),
            )
        ]

    attachment_link = (item.get("links") or {}).get("attachment") or {}
    attachment_href = attachment_link.get("href")
    candidates: list[dict[str, Any]] = []
    if isinstance(attachment_href, str):
        try:
            candidates.append(fetch_item(api_base, attachment_href))
        except Exception:
            candidates = []

    if not candidates and data.get("key"):
        try:
            children = fetch_children(api_base, data["key"])
            candidates = [
                child
                for child in children
                if (child.get("data") or {}).get("itemType") == "attachment"
            ]
        except Exception:
            candidates = []

    resolved: list[ResolvedAttachment] = []
    for attachment in candidates:
        resolved.extend(resolve_attachment_item(attachment, api_base, storage_root, parent=item))
    return resolved


def search_items(api_base: str, query: str, limit: int) -> list[dict[str, Any]]:
    return zotero_json(
        f"{api_base.rstrip('/')}/items",
        {
            "q": query,
            "qmode": "everything",
            "include": "data",
            "limit": limit,
        },
    )


def resolve(args: argparse.Namespace) -> list[ResolvedAttachment]:
    api_base = args.api_base.rstrip("/")
    storage_root = args.storage_root.expanduser()
    items: list[dict[str, Any]]
    if args.key:
        items = [fetch_item(api_base, args.key)]
    else:
        query = args.doi or args.query
        if not query:
            raise SystemExit("Provide --key, --doi, or a query/title.")
        items = search_items(api_base, query, args.limit)
        if args.doi:
            expected_doi = normalize_doi(args.doi)
            items = [
                item
                for item in items
                if normalize_doi((item.get("data") or {}).get("DOI")) == expected_doi
            ]

    resolved: list[ResolvedAttachment] = []
    seen_paths: set[str] = set()
    for item in items:
        for attachment in resolve_attachment_item(item, api_base, storage_root):
            if attachment.path in seen_paths:
                continue
            seen_paths.add(attachment.path)
            resolved.append(attachment)
    return resolved


def render_markdown(results: list[ResolvedAttachment]) -> str:
    if not results:
        return "No local Zotero PDF attachments found.\n"
    lines = [f"Resolved {len(results)} local Zotero PDF attachment(s).", ""]
    for index, item in enumerate(results, start=1):
        meta = [part for part in (item.year, item.publication_title, item.doi) if part]
        lines.append(f"{index}. {item.title or item.attachment_key}")
        if meta:
            lines.append(f"   Meta: {' | '.join(meta)}")
        lines.append(f"   Parent key: {item.parent_key or 'N/A'}")
        lines.append(f"   Attachment key: {item.attachment_key}")
        lines.append(f"   PDF: {item.path}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def run_read_pdf(pdf_path: str, trailing_args: list[str]) -> int:
    script = Path(__file__).with_name("read_pdf.py")
    cmd = [sys.executable, str(script), pdf_path, *trailing_args]
    return subprocess.run(cmd, check=False).returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Resolve local Zotero PDF attachments")
    parser.add_argument("query", nargs="?", help="Title, keyword, DOI, or other Zotero search text")
    parser.add_argument("--key", help="Zotero item key or attachment key")
    parser.add_argument("--doi", help="DOI to search in Zotero")
    parser.add_argument("--limit", type=int, default=10, help="Max Zotero search results before attachment resolution")
    parser.add_argument("--api-base", default=DEFAULT_ZOTERO_API, help="Zotero local API base URL")
    parser.add_argument("--storage-root", type=Path, default=DEFAULT_ZOTERO_STORAGE, help="Zotero storage directory")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--print-path", action="store_true", help="Print only the first resolved PDF path")
    parser.add_argument(
        "--read",
        action="store_true",
        help="Run read_pdf.py on the first resolved PDF. Pass read_pdf.py flags after --.",
    )
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    if "--" in argv:
        split_at = argv.index("--")
        cli_args = argv[:split_at]
        trailing = argv[split_at + 1 :]
    else:
        cli_args = argv
        trailing = []
    args = parser.parse_args(cli_args)

    results = resolve(args)
    if args.print_path:
        if not results:
            return 1
        print(results[0].path)
        return 0

    if args.read:
        if not results:
            print("No local Zotero PDF attachments found.", file=sys.stderr)
            return 1
        return run_read_pdf(results[0].path, trailing)

    if args.format == "json":
        print(json.dumps([asdict(item) for item in results], ensure_ascii=False, indent=2))
    else:
        print(render_markdown(results), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
