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

## Asset-Versionierung

Die statischen Dateien werden mit einer Versionskennung ausgeliefert:

```text
?v=2026-06-28-4
```

Die Kennung steht zusätzlich in `ASSET_VERSION`. Bei einem Release nur diese Version in den HTML-Dateien und in `dist/app.js` erhöhen. Dadurch laden Browser neue CSS/JS/Icon/JSON/Markdown-Dateien statt alter Cache-Versionen.

Die Startseite `index.html` verlinkt beide Varianten:

- `browser-online.html`: Online-Version mit serverseitiger Suche.
- `browser.html`: Offline-Version mit lokalem Suchindex.

## Start

Offline lokal zum Testen zum Beispiel:

```bash
python3 -m http.server 8765
```

Dann öffnen:

```text
http://127.0.0.1:8765/browser.html
```

## WissenDB StGB-Grundbegriffe

Die Datei `knowledge.json` enthält nun eine deutsche Grundauswahl wichtiger Strafrechtsbegriffe aus dem Umfeld des StGB, z. B. Strafbarkeit, Tatbestand, Vorsatz, Fahrlässigkeit, Rechtswidrigkeit, Schuld, Versuch, Rücktritt, Täterschaft, Teilnahme, Notwehr, Notstand, Diebstahl, Betrug und Körperverletzung.

Die Erklärungen sind kurze Orientierungstexte für Tooltips und ersetzen keine Rechtsberatung.

## Sprüche auf der Startseite

`index.html` zeigt nun eine deutschsprachige Spruchliste und oben daraus zufällig einen Spruch als Blickfang. Die Sprüche stehen direkt in der Startseite, damit keine extra Datei geladen werden muss.

Asset-Version: `2026-06-28-4`.

## Update 2026-06-28-4

- Suche startet erst ab 3 Zeichen.
- Suche wird mit 787 ms Verzögerung entprellt.
- WissenDB ergänzt: Hochverrat, Gefährdung, demokratisch, Rechtsstaat.
