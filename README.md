# Lawking

Erster Prototyp für einen deutschen Gesetzesbrowser in schlichtem HTML/JavaScript.

Die Anwendung ist deutsch-only.

## Modi

- `browser.html`: Offline-Modus. Lädt `data/books.json` und `data/search-index.json` im Browser.
- `browser-online.html`: Online-Modus. Lädt nur `data/books.json`; die Suche läuft über `search.php` auf dem Server.

## Daten bauen

Der Gesetzesbaum liegt lokal unter `./gesetze`.

```bash
mkdir -p data
python3 indexer.py ./gesetze --out data
```

Die Pfade in `data/books.json` müssen zu den ausgelieferten Dateien passen.

Ein einfaches Layout:

```text
lawking/
  browser.html
  browser-online.html
  search.php
  dist/
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

## Online-Suche

`browser-online.html` setzt:

```html
<script>window.LAWKING_SEARCH_API = "search.php";</script>
```

Dadurch wird `data/search-index.json` nicht im Browser geladen. Suchanfragen gehen an:

```text
search.php?q=...&max=100
```

`search.php` durchsucht den serverseitigen `gesetze/`-Baum und liefert kleine JSON-Treffer zurück.

## Wissens-Hinweise / Tooltips

Begriffe für Hover-Hinweise liegen in `knowledge.json`.

Format:

```json
{
  "begriff": "Augenzeuge",
  "erklaerung": "Kurze deutsche Erklärung.",
  "aliases": ["Augenzeugin", "Augenzeugen"]
}
```

Beim Öffnen eines Gesetzbuchs werden passende Begriffe im Text markiert. Der Hinweis erscheint per Hover oder Tastaturfokus.

## Start

Offline lokal zum Testen zum Beispiel:

```bash
python3 -m http.server 8765
```

Dann öffnen:

```text
http://127.0.0.1:8765/browser.html
```
