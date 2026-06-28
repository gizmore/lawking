#!/usr/bin/env python3
# Copyright (c) 2026 gizmore. All rights reserved.
"""
doit.py

PyCharm/debug helper for lawking.

Runs:
    0. git reset --hard inside ./gesetze submodule
    1. build/bookler.py   -> creates ./data/bookmap.json
    2. build/decorator.py -> creates anchors
    3. build/linker.py    -> creates links to anchors
    4. build/indexer.py   -> creates ./data/books.json and ./data/search-index.json

Expected repo layout:
    doit.py
    build/
        __init__.py
        bookler.py
        decorator.py
        linker.py
        indexer.py
    data/
    gesetze/          # git submodule
    index.html
    app.js
    app.css

Run/debug this file from the lawking repo root.
"""

from __future__ import annotations

import importlib
import subprocess
import sys
from pathlib import Path


# ---- debug config ---------------------------------------------------------

ROOTS = [
    "./gesetze",
]

WRITE = True

BOOKMAP = "./data/bookmap.json"
DATA_DIR = "./data"


# ---- runner ---------------------------------------------------------------

def run_tool(module_name: str, argv: list[str]) -> int:
    old_argv = sys.argv[:]

    try:
        sys.argv = argv
        module = importlib.import_module(f"build.{module_name}")
        return int(module.main() or 0)
    finally:
        sys.argv = old_argv


def ensure_build_package(repo_root: Path) -> None:
    init_file = repo_root / "build" / "__init__.py"

    if not init_file.exists():
        init_file.write_text("", encoding="utf-8")


def git_reset_hard(repo: Path) -> None:
    subprocess.run(
        ["git", "reset", "--hard"],
        cwd=repo,
        check=True,
    )


def main() -> int:
    repo_root = Path(__file__).resolve().parent
    sys.path.insert(0, str(repo_root))

    ensure_build_package(repo_root)

    data_dir = (repo_root / DATA_DIR).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    gesetze_repo = (repo_root / "gesetze").resolve()

    if not gesetze_repo.exists():
        print(f"Missing gesetze submodule folder: {gesetze_repo}", file=sys.stderr)
        return 1

    print("== reset gesetze submodule ==")
    git_reset_hard(gesetze_repo)

    print()
    print("== bookler ==")
    result = run_tool("bookler", [
        "build/bookler.py",
        *ROOTS,
        "--pretty",
        "-o",
        BOOKMAP,
    ])

    if result != 0:
        return result

    write_args: list[str] = []

    if WRITE:
        write_args.append("--write")

    print()
    print("== decorator ==")
    result = run_tool("decorator", [
        "build/decorator.py",
        *write_args,
        *ROOTS,
    ])

    if result != 0:
        return result

    print()
    print("== linker ==")
    result = run_tool("linker", [
        "build/linker.py",
        *write_args,
        *ROOTS,
        "--bookmap",
        BOOKMAP,
    ])

    if result != 0:
        return result

    print()
    print("== indexer ==")
    result = run_tool("indexer", [
        "build/indexer.py",
        *ROOTS,
        "--out",
        DATA_DIR,
    ])

    if result != 0:
        return result

    print()
    print("== lawking build complete ==")
    print(f"bookmap: {BOOKMAP}")
    print(f"data:    {DATA_DIR}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
