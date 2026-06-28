const Lawking = (() => {
  let books = [];
  let searchIndex = [];
  let currentBook = null;
  let searchTimer = null;

  const elBooks = () => document.getElementById("books");
  const elResults = () => document.getElementById("results");
  const elViewer = () => document.getElementById("viewer");
  const elSearch = () => document.getElementById("search");
  const elSearchStatus = () => document.getElementById("search-status");

  function htmlEscape(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function attrEscape(s) {
    return htmlEscape(s).replaceAll('"', "&quot;");
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .replace(/[^\p{L}\p{N}§]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function loadJson(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.status + " " + path);
      return await res.json();
    } catch (e) {
      console.warn("Could not load", path, e);
      return fallback;
    }
  }

  function candidateMarkdownPaths(path) {
    const clean = String(path || "").replace(/^\.\//, "").replace(/\\/g, "/");
    const candidates = [];

    function add(value) {
      if (value && !candidates.includes(value)) {
        candidates.push(value);
      }
    }

    add(clean);

    if (!clean.startsWith("gesetze/")) {
      add("gesetze/" + clean);
    }

    if (clean.startsWith("gesetze/")) {
      add(clean.slice("gesetze/".length));
    }

    return candidates;
  }

  async function loadText(path) {
    const tried = [];

    for (const candidate of candidateMarkdownPaths(path)) {
      tried.push(candidate);

      const res = await fetch(candidate);

      if (res.ok) {
        return {
          text: await res.text(),
          path: candidate,
        };
      }
    }

    throw new Error("404 " + tried.join(" | "));
  }

  function shortBookTitle(book) {
    return book.jurabk || book.slug || book.origslug || book.title || book.path;
  }

  function renderBooks() {
    const grouped = new Map();

    for (const book of books) {
      const key = (book.id || book.path || "?").charAt(0).toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(book);
    }

    const letters = Array.from(grouped.keys()).sort();

    elBooks().innerHTML = letters.map(letter => {
      const items = grouped.get(letter)
        .sort((a, b) => shortBookTitle(a).localeCompare(shortBookTitle(b), "de"))
        .map(book => `
          <div class="book" data-path="${attrEscape(book.path)}">
            <span class="abbr">${htmlEscape(shortBookTitle(book))}</span>
            <span>${htmlEscape(book.title || "")}</span>
            <span class="path">${htmlEscape(book.id || book.path)}</span>
          </div>
        `).join("");

      return `<div class="book-letter">${htmlEscape(letter)}</div>${items}`;
    }).join("");

    elBooks().querySelectorAll(".book").forEach(node => {
      node.addEventListener("click", () => openBook(node.dataset.path));
    });
  }

  function highlightOops(html) {
    return html.replace(
      /\(Oops, ([^)]+)\)/g,
      '<span class="oops">(Oops, $1)</span>'
    );
  }

  function markdownToHtml(md) {
    let html;

    if (window.marked && window.marked.parse) {
      html = window.marked.parse(md, {
        gfm: true,
        breaks: false,
        mangle: false,
        headerIds: false,
      });
    } else {
      html = fallbackMarkdownToHtml(md);
    }

    return `<div class="markdown">${highlightOops(html)}</div>`;
  }

  function fallbackMarkdownToHtml(md) {
    const lines = md.split(/\r?\n/);
    let out = [];
    let paragraph = [];

    function inlineMarkdown(text) {
      let escaped = htmlEscape(text);

      escaped = escaped.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_m, label, href) => `<a href="${attrEscape(href)}">${label}</a>`
      );

      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

      return escaped;
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push(`<p>${inlineMarkdown(paragraph.join("\n"))}</p>`);
      paragraph = [];
    }

    for (const line of lines) {
      const anchor = line.match(/^\s*<a\s+id="([^"]+)"><\/a>\s*$/);
      if (anchor) {
        flushParagraph();
        out.push(`<span id="${attrEscape(anchor[1])}"></span>`);
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        flushParagraph();
        const level = h[1].length;
        out.push(`<h${level}>${inlineMarkdown(h[2])}</h${level}>`);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        continue;
      }

      paragraph.push(line);
    }

    flushParagraph();
    return out.join("\n");
  }

  function bookByMarkdownPath(path) {
    const clean = path.replace(/^\.?\//, "").replace(/\\/g, "/");
    return books.find(b => b.path === clean || b.markdown === clean);
  }

  function resolveHref(href) {
    if (!currentBook) return null;

    if (href.startsWith("#")) {
      return {
        path: currentBook.path,
        hash: href.slice(1),
      };
    }

    const [rawPath, rawHash] = href.split("#");
    const currentPath = currentBook.loadedPath || currentBook.path;
    const currentDir = currentPath.split("/").slice(0, -1).join("/");
    const parts = (currentDir + "/" + rawPath).split("/");
    const normalized = [];

    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") normalized.pop();
      else normalized.push(part);
    }

    let path = normalized.join("/");

    if (!path.endsWith("index.md")) {
      path = path.replace(/\/$/, "") + "/index.md";
    }

    return { path, hash: rawHash || "" };
  }

  function markActiveBook(path) {
    elBooks().querySelectorAll(".book").forEach(node => {
      node.classList.toggle("active", node.dataset.path === path);
    });
  }

  async function openBook(path, hash = "") {
    const book = bookByMarkdownPath(path) || books.find(b => b.path === path);

    if (!book) {
      elViewer().innerHTML = `<div class="error">Book not found: <code>${htmlEscape(path)}</code></div>`;
      return;
    }

    currentBook = book;
    markActiveBook(book.path);

    elViewer().innerHTML = `<div class="loading">Loading ${htmlEscape(book.title || book.path)}...</div>`;

    try {
      const loaded = await loadText(book.path);
      book.loadedPath = loaded.path;
      elViewer().innerHTML = markdownToHtml(loaded.text);
      wireViewerLinks();

      if (window.LAWKING_LAST_SEARCH) {
        highlightViewer(window.LAWKING_LAST_SEARCH);
      }

      if (hash) {
        scrollToHash(hash);
      } else {
        elViewer().scrollTop = 0;
      }
    } catch (e) {
      elViewer().innerHTML = `<div class="error">Could not load <code>${htmlEscape(book.path)}</code><br>${htmlEscape(e.message)}</div>`;
    }
  }

  function wireViewerLinks() {
    elViewer().querySelectorAll("a[href]").forEach(a => {
      a.addEventListener("click", ev => {
        const href = a.getAttribute("href");

        if (!href || href.startsWith("http:") || href.startsWith("https:") || href.startsWith("mailto:")) {
          return;
        }

        ev.preventDefault();
        const target = resolveHref(href);

        if (target) {
          openBook(target.path, target.hash);
        }
      });
    });
  }

  function scrollToHash(hash) {
    if (!hash) return;

    const target = document.getElementById(hash);

    if (!target) return;

    target.scrollIntoView({ block: "start" });
    target.classList.add("anchor-target");
    setTimeout(() => target.classList.remove("anchor-target"), 1800);
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseSearchQuery(raw) {
    const query = String(raw || "").trim();

    if (!query) {
      return {
        raw: "",
        normalized: "",
        terms: [],
        regex: null,
        mode: "empty",
      };
    }

    // Regex mode:
    //   /straf.*ordnung/i
    //   /§\s*100a/
    const regexMatch = query.match(/^\/(.+)\/([dgimsuvy]*)$/);

    if (regexMatch) {
      try {
        const flags = regexMatch[2].includes("i") ? regexMatch[2] : regexMatch[2] + "i";
        return {
          raw: query,
          normalized: normalize(query),
          terms: [],
          regex: new RegExp(regexMatch[1], flags),
          mode: "regex",
        };
      } catch (e) {
        return {
          raw: query,
          normalized: normalize(query),
          terms: [],
          regex: null,
          mode: "bad-regex",
          error: e.message,
        };
      }
    }

    // Wildcard mode:
    //   straf*ordnung
    //   § 100a * strafprozessordnung
    if (query.includes("*")) {
      const pattern = query
        .split(/\s+/)
        .map(part => escapeRegex(part).replaceAll("\\*", ".*"))
        .join(".*");

      return {
        raw: query,
        normalized: normalize(query.replaceAll("*", " ")),
        terms: normalize(query.replaceAll("*", " ")).split(" ").filter(Boolean),
        regex: new RegExp(pattern, "i"),
        mode: "wildcard",
      };
    }

    const normalized = normalize(query);

    return {
      raw: query,
      normalized,
      terms: normalized.split(" ").filter(Boolean),
      regex: null,
      mode: "terms",
    };
  }

  function itemHaystack(item) {
    return [
      item.book,
      item.jurabk,
      item.title,
      item.text,
      item.snippet,
      item.path,
      item.anchor,
      item.search,
    ].join(" ");
  }

  function scoreItem(item, parsed) {
    const rawHay = itemHaystack(item);
    const hay = item.search || normalize(rawHay);

    if (parsed.regex) {
      const ok = parsed.regex.test(rawHay) || parsed.regex.test(hay);

      if (!ok) return 0;

      let score = 5;

      if (parsed.regex.test(item.jurabk || "")) score += 8;
      if (parsed.regex.test(item.book || "")) score += 4;
      if (parsed.regex.test(item.title || "")) score += 3;

      return score;
    }

    let score = 0;

    for (const term of parsed.terms) {
      if (!hay.includes(term)) {
        return 0;
      }

      score += 1;

      if ((item.jurabk || "").toLowerCase() === term) score += 8;
      if (normalize(item.book || "").includes(term)) score += 3;
      if (normalize(item.title || "").includes(term)) score += 2;
      if (normalize(item.path || "").includes(term)) score += 1;
    }

    if ((item.anchor || "").includes(parsed.terms.join("-"))) score += 4;

    return score;
  }

  function highlightText(text, parsed) {
    const original = String(text || "");

    if (!original) return "";

    let escaped = htmlEscape(original);

    if (parsed.regex) {
      try {
        const flags = parsed.regex.flags.includes("g") ? parsed.regex.flags : parsed.regex.flags + "g";
        const rx = new RegExp(parsed.regex.source, flags);
        return escaped.replace(rx, match => `<mark>${match}</mark>`);
      } catch (_e) {
        return escaped;
      }
    }

    const terms = [...parsed.terms]
      .filter(term => term.length >= 2 || term === "§")
      .sort((a, b) => b.length - a.length);

    if (!terms.length) return escaped;

    const rx = new RegExp("(" + terms.map(escapeRegex).join("|") + ")", "gi");
    return escaped.replace(rx, "<mark>$1</mark>");
  }

  function highlightViewer(parsed) {
    if (!parsed || parsed.mode === "empty" || parsed.mode === "bad-regex") return;

    const root = elViewer().querySelector(".markdown");

    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && ["SCRIPT", "STYLE", "CODE", "PRE", "A", "MARK"].includes(node.parentElement.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      const text = node.nodeValue;
      let html = null;

      if (parsed.regex) {
        try {
          const flags = parsed.regex.flags.includes("g") ? parsed.regex.flags : parsed.regex.flags + "g";
          const rx = new RegExp(parsed.regex.source, flags);
          if (!rx.test(text)) continue;
          html = htmlEscape(text).replace(rx, match => `<mark>${htmlEscape(match)}</mark>`);
        } catch (_e) {
          continue;
        }
      } else {
        const terms = [...parsed.terms]
          .filter(term => term.length >= 2 || term === "§")
          .sort((a, b) => b.length - a.length);

        if (!terms.length) continue;

        const rx = new RegExp("(" + terms.map(escapeRegex).join("|") + ")", "gi");

        if (!rx.test(text)) continue;

        html = htmlEscape(text).replace(rx, "<mark>$1</mark>");
      }

      const span = document.createElement("span");
      span.innerHTML = html;
      node.parentNode.replaceChild(span, node);
    }
  }

  function doSearchNow(query) {
    const parsed = parseSearchQuery(query);

    window.LAWKING_LAST_SEARCH = parsed;

    if (!parsed.raw) {
      elResults().innerHTML = "";
      elSearchStatus().textContent = `${books.length} books, ${searchIndex.length} searchable chunks.`;
      return;
    }

    if (parsed.mode === "bad-regex") {
      elResults().innerHTML = "";
      elSearchStatus().textContent = `Bad regex: ${parsed.error}`;
      return;
    }

    const results = [];

    for (const item of searchIndex) {
      const score = scoreItem(item, parsed);

      if (score > 0) {
        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const max = 100;
    const shown = results.slice(0, max);
    const mode = parsed.mode === "regex" ? "regex" : parsed.mode === "wildcard" ? "wildcard" : "text";

    elSearchStatus().textContent = `${results.length} ${mode} results${results.length > max ? `, showing ${max}` : ""}.`;

    elResults().innerHTML = shown.map(({ item }) => `
      <div class="result" data-path="${attrEscape(item.path)}" data-anchor="${attrEscape(item.anchor || "")}">
        <div class="title">
          <span class="abbr">${highlightText(item.jurabk || "", parsed)}</span>
          ${highlightText(item.title || item.book || item.path, parsed)}
        </div>
        <div class="snippet">${highlightText(item.snippet || "", parsed)}</div>
        <div class="meta">${htmlEscape(item.path)}${item.anchor ? " #" + htmlEscape(item.anchor) : ""}</div>
      </div>
    `).join("");

    elResults().querySelectorAll(".result").forEach(node => {
      node.addEventListener("click", () => openBook(node.dataset.path, node.dataset.anchor));
    });
  }

  function doSearchDebounced(query) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearchNow(query), 120);
  }

  async function init() {
    books = await loadJson("data/books.json", []);
    searchIndex = await loadJson("data/search-index.json", []);

    renderBooks();
    elSearchStatus().textContent = `${books.length} books, ${searchIndex.length} searchable chunks.`;

    elSearch().addEventListener("input", ev => doSearchDebounced(ev.target.value));
  }

  function openHome() {
    currentBook = null;
    markActiveBook("");
    elViewer().innerHTML = `
      <div class="welcome">
        <h1>Lawking</h1>
        <p>Offline legal Markdown browser with verified links and audit warnings.</p>
        <p>Search all laws on the left, or open a book from the tree.</p>
      </div>
    `;
  }

  return { init, openBook, openHome };
})();

window.addEventListener("DOMContentLoaded", Lawking.init);
