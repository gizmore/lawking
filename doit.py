#!/usr/bin/env python3
# Copyright (c) 2026 chappy and gizmore. all rights reserved
"""
doit.py

PyCharm/debug helper for lawking.

Runs:
    0. git reset --hard in ./gesetze
    1. bookler.py   -> creates data/bookmap.json
    2. decorator.py -> creates anchors
    3. linker.py    -> creates links to anchors
    4. indexer.py   -> creates browser search/navigation data

Put this file in your repo root next to:
    build/
    data/
    gesetze/

Then run/debug doit.py in PyCharm.
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


def main() -> int:
    repo_root = Path(__file__).resolve().parent
    sys.path.insert(0, str(repo_root))

    data_dir = repo_root / DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    repo = (repo_root / "gesetze").resolve()
    subprocess.run(["git", "reset", "--hard"], cwd=repo, check=True)

    write_args: list[str] = []

    if WRITE:
        write_args.append("--write")

    bookler_args = [
        "build/bookler.py",
        *ROOTS,
        "--pretty",
        "-o",
        BOOKMAP,
    ]
    result = run_tool("bookler", bookler_args)

    if result != 0:
        return result

    decorator_args = [
        "build/decorator.py",
        *write_args,
        *ROOTS,
    ]
    result = run_tool("decorator", decorator_args)

    if result != 0:
        return result

    linker_args = [
        "build/linker.py",
        *write_args,
        *ROOTS,
        "--bookmap",
        BOOKMAP,
    ]
    result = run_tool("linker", linker_args)

    if result != 0:
        return result

    indexer_args = [
        "build/indexer.py",
        *ROOTS,
        "--out",
        DATA_DIR,
    ]
    result = run_tool("indexer", indexer_args)

    if result != 0:
        return result

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
