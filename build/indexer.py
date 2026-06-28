#!/usr/bin/env python3
# Copyright (c) 2026 chappy and gizmore. all rights reserved
"""
indexer.py

Build browser data files for lawking offline viewer.

Input:
    patched law tree with **/index.md

Output:
    data/books.json
    data/search-index.json

The viewer loads Markdown files on demand.
The search index stores paragraph-ish chunks and snippets, not whole books.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path


ANCHOR_RE = re.compile(r'^\s*<a\s+id="([^"]+)"></a>\s*$')
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
FRONTMATTER_END_RE = re.compile(r"^---\s*$")


@dataclass
class Book:
    id: str
    title: str
    path: str
    jurabk: str | None = None
    slug: str | None = None
    origslug: str | None = None


@dataclass
class SearchItem:
    id: str
    path: str
    anchor: str
    book: str
    jurabk: str | None
    title: str
    snippet: str
    search: str


def normalize(value: str) -> str:
    value = value.lower().replace("\u00a0", " ")
    value = re.sub(r"[^\w\s§]+", " ", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def parse_frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()

    if not lines or lines[0].strip() != "---":
        return {}

    data: dict[str, str] = {}

    for line in lines[1:]:
        if FRONTMATTER_END_RE.match(line):
            break

        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip('"').strip("'")

        if key:
            data[key] = value

    return data


def strip_markdown(value: str) -> str:
    value = re.sub(r'<a\s+id="[^"]+"></a>', " ", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"\1", value)
    value = re.sub(r"<[^>]+>", " ", value)
    return clean(value)


def iter_index_files(root: Path) -> list[Path]:
    return sorted(root.rglob("index.md"))


def rel(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def first_heading(text: str) -> str | None:
    in_frontmatter = text.startswith("---")
    for line in text.splitlines():
        if in_frontmatter:
            if line.strip() == "---":
                in_frontmatter = False
            continue

        m = HEADING_RE.match(line)
        if m:
            return clean(m.group(2))

    return None


def parse_book(path: Path, root: Path, text: str) -> Book:
    fm = parse_frontmatter(text)
    title = fm.get("title") or fm.get("longtitle") or first_heading(text) or rel(path.parent, root)

    book_id = rel(path.parent, root)

    return Book(
        id=book_id,
        title=title,
        path=rel(path, root),
        jurabk=fm.get("jurabk"),
        slug=fm.get("slug"),
        origslug=fm.get("origslug"),
    )


def chunk_book(book: Book, text: str, max_chars: int) -> list[SearchItem]:
    items: list[SearchItem] = []
    anchor = ""
    heading = book.title
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        raw = "\n".join(buf)
        plain = strip_markdown(raw)

        if not plain:
            buf = []
            return

        snippet = plain[:240]
        search = normalize(" ".join([
            book.title,
            book.jurabk or "",
            book.slug or "",
            heading,
            plain,
        ]))

        item_id = f"{book.id}#{anchor or len(items)}"

        items.append(SearchItem(
            id=item_id,
            path=book.path,
            anchor=anchor,
            book=book.title,
            jurabk=book.jurabk,
            title=heading,
            snippet=snippet,
            search=search,
        ))

        buf = []

    in_frontmatter = text.startswith("---")
    in_code = False

    for line in text.splitlines():
        if in_frontmatter:
            if line.strip() == "---":
                in_frontmatter = False
            continue

        if line.strip().startswith(("```", "~~~")):
            in_code = not in_code
            continue

        if in_code:
            continue

        m_anchor = ANCHOR_RE.match(line)
        if m_anchor:
            flush()
            anchor = m_anchor.group(1)
            continue

        m_head = HEADING_RE.match(line)
        if m_head:
            flush()
            heading = strip_markdown(m_head.group(2))
            continue

        if not line.strip():
            if sum(len(x) for x in buf) >= max_chars:
                flush()
            continue

        buf.append(line)

        if sum(len(x) for x in buf) >= max_chars:
            flush()

    flush()
    return items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--out", type=Path, default=Path("data"))
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--encoding", default="utf-8")
    args = parser.parse_args()

    root = args.root.resolve()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    books: list[Book] = []
    search: list[SearchItem] = []

    for path in iter_index_files(root):
        text = path.read_text(encoding=args.encoding)
        book = parse_book(path, root, text)
        books.append(book)
        search.extend(chunk_book(book, text, args.max_chars))

    books.sort(key=lambda b: ((b.jurabk or b.title).lower(), b.title.lower()))

    (out / "books.json").write_text(
        json.dumps([asdict(book) for book in books], ensure_ascii=False, indent=2) + "\n",
        encoding=args.encoding,
    )

    (out / "search-index.json").write_text(
        json.dumps([asdict(item) for item in search], ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding=args.encoding,
    )

    print(f"books:        {len(books)}")
    print(f"search items: {len(search)}")
    print(f"output:       {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
