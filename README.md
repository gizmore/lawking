# Lawking

A first person lawyer simulation in go and plain html/Markdawn,


# lawking offline browser prototype

This is a tiny offline law browser.

It serves static files from a local folder and opens the browser.

It searches across multiple files with an indexed tree or smth.


## Build data

Assume your (patched?;)) law tree is at `./gesetze`.

You can get this from the [brd](https://github.com/bundestag/gesetze).

```bash
mkdir -p data
python3 indexer.py ./gesetze --out data
```

The browser expects paths in `books.json` to match actual files.

The simplest layout is to run `indexer.py` with the same root that is served.

Example distribution layout:

```txt
lawking/
  dist/
    lawking
    index.html
    app.js
    app.css
  data/
    books.json
    search-index.json
  gesetze/
    a/
    b/
    s/
    ...
```

For that layout, build:

```bash
git clone --recursive https://github.com/gizmore/lawking
cd lawking
python3 build/indexer.py ./gesetze --out data
```

## Build launcher

```bash
go build -o lawking ./build/lawking.go
```

## Run

```bash
./lawking
```

Then browser opens:

```txt
http://127.0.0.1:8765/
```

No internet needed.
No Python needed for users.
Python is only used at build time.
