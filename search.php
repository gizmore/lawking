<?php
declare(strict_types=1);

/*
 * Lawking online search endpoint.
 *
 * Keeps the large law corpus on the server and returns only small JSON results.
 * Expected layout:
 *   search.php
 *   gesetze/<book>/index.md
 *   data/books.json   optional, for titles/jurabk lookup
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = __DIR__;
$lawDir = $root . '/gesetze';
$bookFile = $root . '/data/books.json';
$q = trim((string)($_GET['q'] ?? ''));
$max = max(1, min(200, (int)($_GET['max'] ?? 100)));

if ($q === '') {
    echo json_encode([
        'query' => '',
        'mode' => 'empty',
        'total' => 0,
        'results' => [],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalize_text(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $s = str_replace("\xc2\xa0", ' ', $s);
    $s = preg_replace('/[^\p{L}\p{N}§]+/u', ' ', $s) ?? $s;
    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    return trim($s);
}

function json_fail(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode([
        'error' => $message,
        'total' => 0,
        'results' => [],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function parse_query(string $q): array
{
    if (preg_match('/^\/(.+)\/([dgimsuvy]*)$/u', $q, $m)) {
        $flags = str_contains($m[2], 'i') ? 'iu' : 'u';
        return [
            'mode' => 'regex',
            'regex' => '/' . str_replace('/', '\/', $m[1]) . '/' . $flags,
            'terms' => [],
        ];
    }

    if (str_contains($q, '*')) {
        $parts = preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $pattern = implode('.*', array_map(
            static fn(string $part): string => str_replace('\\*', '.*', preg_quote($part, '/')),
            $parts
        ));

        return [
            'mode' => 'wildcard',
            'regex' => '/' . $pattern . '/iu',
            'terms' => array_values(array_filter(explode(' ', normalize_text(str_replace('*', ' ', $q))))),
        ];
    }

    return [
        'mode' => 'terms',
        'regex' => null,
        'terms' => array_values(array_filter(explode(' ', normalize_text($q)))),
    ];
}

function load_book_meta(string $bookFile): array
{
    if (!is_file($bookFile)) {
        return [];
    }

    $books = json_decode((string)file_get_contents($bookFile), true);

    if (!is_array($books)) {
        return [];
    }

    $meta = [];

    foreach ($books as $book) {
        if (!is_array($book) || empty($book['path'])) {
            continue;
        }

        $path = (string)$book['path'];
        $meta[$path] = $book;
        $meta[preg_replace('#^gesetze/#', '', $path)] = $book;
    }

    return $meta;
}

function first_anchor_before(string $text, int $offset): string
{
    $before = substr($text, 0, $offset);

    if (preg_match_all('/<a\s+id="([^"]+)"><\/a>/u', $before, $matches) && !empty($matches[1])) {
        return (string)end($matches[1]);
    }

    if (preg_match_all('/<span\s+id="([^"]+)"><\/span>/u', $before, $matches) && !empty($matches[1])) {
        return (string)end($matches[1]);
    }

    return '';
}

function make_snippet(string $text, int $offset, int $length = 260): string
{
    $start = max(0, $offset - 90);
    $snippet = mb_substr($text, $start, $length, 'UTF-8');
    $snippet = preg_replace('/\s+/u', ' ', $snippet) ?? $snippet;
    return trim(($start > 0 ? '…' : '') . $snippet . (mb_strlen($text, 'UTF-8') > $start + $length ? '…' : ''));
}

function item_score(array $book, string $path, string $text, array $parsed): int
{
    $title = (string)($book['title'] ?? '');
    $jurabk = (string)($book['jurabk'] ?? '');
    $hay = normalize_text($jurabk . ' ' . $title . ' ' . $path . ' ' . $text);

    if ($parsed['regex']) {
        $ok = @preg_match($parsed['regex'], $text . ' ' . $title . ' ' . $jurabk . ' ' . $path);

        if ($ok === false) {
            json_fail('Bad regex');
        }

        if (!$ok) {
            return 0;
        }

        return 5
            + (@preg_match($parsed['regex'], $jurabk) ? 8 : 0)
            + (@preg_match($parsed['regex'], $title) ? 3 : 0)
            + (@preg_match($parsed['regex'], $path) ? 1 : 0);
    }

    $score = 0;

    foreach ($parsed['terms'] as $term) {
        if (!str_contains($hay, $term)) {
            return 0;
        }

        $score += 1;

        if (normalize_text($jurabk) === $term) {
            $score += 8;
        }

        if (str_contains(normalize_text($title), $term)) {
            $score += 2;
        }

        if (str_contains(normalize_text($path), $term)) {
            $score += 1;
        }
    }

    return $score;
}

if (!is_dir($lawDir)) {
    json_fail('Missing gesetze directory on server', 500);
}

$parsed = parse_query($q);
$meta = load_book_meta($bookFile);
$results = [];
$seenBooks = [];
$total = 0;

$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($lawDir, FilesystemIterator::SKIP_DOTS)
);

foreach ($it as $file) {
    /** @var SplFileInfo $file */
    if (!$file->isFile() || $file->getFilename() !== 'index.md') {
        continue;
    }

    $fullPath = $file->getPathname();
    $rel = str_replace('\\', '/', substr($fullPath, strlen($root) + 1));
    $dedupeKey = preg_replace('#/index\.md$#', '', preg_replace('#^gesetze/#', '', $rel));

    if (isset($seenBooks[$dedupeKey])) {
        continue;
    }

    $text = (string)file_get_contents($fullPath);
    $book = $meta[$rel] ?? $meta[preg_replace('#^gesetze/#', '', $rel)] ?? [];
    $score = item_score($book, $rel, $text, $parsed);

    if ($score <= 0) {
        continue;
    }

    $offset = 0;

    if ($parsed['regex']) {
        if (@preg_match($parsed['regex'], $text, $m, PREG_OFFSET_CAPTURE)) {
            $offset = (int)$m[0][1];
        }
    } else {
        $normText = normalize_text($text);
        $pos = strpos($normText, (string)($parsed['terms'][0] ?? ''));
        $offset = $pos === false ? 0 : min(strlen($text), $pos);
    }

    $seenBooks[$dedupeKey] = true;
    $total++;

    if (count($results) < $max) {
        $results[] = [
            'score' => $score,
            'path' => $rel,
            'anchor' => first_anchor_before($text, $offset),
            'jurabk' => (string)($book['jurabk'] ?? ''),
            'title' => (string)($book['title'] ?? basename(dirname($rel))),
            'book' => (string)($book['title'] ?? basename(dirname($rel))),
            'snippet' => make_snippet($text, $offset),
        ];
    }
}

usort($results, static fn(array $a, array $b): int => ($b['score'] <=> $a['score']) ?: strcmp($a['path'], $b['path']));

foreach ($results as &$result) {
    unset($result['score']);
}
unset($result);

echo json_encode([
    'query' => $q,
    'mode' => $parsed['mode'],
    'total' => $total,
    'results' => $results,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
