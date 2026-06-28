const Lawking = (() => {
  let books = [];
  let searchIndex = [];
  let currentBook = null;
  let searchTimer = null;
  let searchApi = "";
  let searchSeq = 0;
  const SEARCH_DELAY_MS = 787;
  const SEARCH_MIN_CHARS = 3;
  let knowledge = [];
  let knowledgeTerms = [];
  const ASSET_VERSION = String(window.LAWKING_ASSET_VERSION || "2026-06-28-7").trim();

  function versionedUrl(path) {
    if (!ASSET_VERSION) return path;
    try {
      const url = new URL(path, window.location.href);
      url.searchParams.set("v", ASSET_VERSION);
      return url.toString();
    } catch (e) {
      const glue = String(path).includes("?") ? "&" : "?";
      return String(path) + glue + "v=" + encodeURIComponent(ASSET_VERSION);
    }
  }

  const elBooks = () => document.getElementById("books");
  const elResults = () => document.getElementById("results");
  const elViewer = () => document.getElementById("viewer");
  const elSearch = () => document.getElementById("search");
  const elSearchStatus = () => document.getElementById("search-status");
  const elKnowledge = () => document.getElementById("knowledge");
  const elKnowledgePanel = () => document.getElementById("knowledge-panel");

  function spinnerText(text) {
    return `<span class="spinner" aria-hidden="true"></span><span>${htmlEscape(text)}</span>`;
  }

  function setSearchStatus(text, spinning = false) {
    const node = elSearchStatus();
    if (!node) return;

    node.innerHTML = spinning ? spinnerText(text) : htmlEscape(text);
    node.classList.toggle("is-loading", spinning);
  }

  function setViewerLoading(text) {
    elViewer().innerHTML = `<div class="loading is-loading">${spinnerText(text)}</div>`;
  }

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
      const res = await fetch(versionedUrl(path));
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

      const res = await fetch(versionedUrl(candidate));

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


  function initKnowledgePanel() {
    const panel = elKnowledgePanel();
    if (!panel) return;

    const saved = localStorage.getItem("lawking.wissendb.offen");
    if (saved === "1") panel.open = true;
    if (saved === "0") panel.open = false;

    panel.addEventListener("toggle", () => {
      localStorage.setItem("lawking.wissendb.offen", panel.open ? "1" : "0");
    });
  }


  function renderKnowledge() {
    const node = elKnowledge();

    if (!node) return;

    if (!knowledge.length) {
      node.innerHTML = `<div class="knowledge-empty">Noch keine Begriffe.</div>`;
      return;
    }

    node.innerHTML = knowledge.map(item => `
      <details class="knowledge-item">
        <summary>${htmlEscape(item.begriff || "?")}</summary>
        <div>${htmlEscape(item.erklaerung || "")}</div>
      </details>
    `).join("");
  }

  function prepareKnowledgeTerms() {
    const terms = [];

    for (const item of knowledge) {
      const names = [item.begriff, ...(Array.isArray(item.aliases) ? item.aliases : [])]
        .map(name => String(name || "").trim())
        .filter(Boolean);

      for (const name of names) {
        terms.push({
          term: name,
          lower: name.toLocaleLowerCase("de"),
          title: `${item.begriff}: ${item.erklaerung}`,
        });
      }
    }

    knowledgeTerms = terms.sort((a, b) => b.term.length - a.term.length);
  }

  function isWordChar(ch) {
    return !!ch && /[\p{L}\p{N}_]/u.test(ch);
  }

  function applyKnowledgeTooltips(root) {
    if (!knowledgeTerms.length || !root) return;

    const rx = new RegExp(knowledgeTerms.map(item => escapeRegex(item.term)).join("|"), "giu");
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          if (parent.closest("script, style, code, pre, a, mark, .knowledge-term")) {
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
      const fragment = document.createDocumentFragment();
      let last = 0;
      let changed = false;
      rx.lastIndex = 0;

      for (const match of text.matchAll(rx)) {
        const word = match[0];
        const index = match.index || 0;
        const before = text[index - 1] || "";
        const after = text[index + word.length] || "";

        if (isWordChar(before) || isWordChar(after)) {
          continue;
        }

        const info = knowledgeTerms.find(item => item.lower === word.toLocaleLowerCase("de"));
        if (!info) continue;

        if (index > last) {
          fragment.appendChild(document.createTextNode(text.slice(last, index)));
        }

        const span = document.createElement("span");
        span.className = "knowledge-term";
        span.tabIndex = 0;
        span.title = info.title;
        span.textContent = word;
        fragment.appendChild(span);

        last = index + word.length;
        changed = true;
      }

      if (!changed) continue;

      if (last < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(last)));
      }

      node.parentNode.replaceChild(fragment, node);
    }
  }

  function highlightOops(html) {
    return html.replace(
      /\(Oops, ([^)]+)\)/g,
      '<span class="oops">(Oops, $1)</span>'
    );
  }

  function prepareMarkdownForRenderer(md) {
    /*
      Marked/CommonMark can treat raw HTML anchor lines as HTML blocks.

      Bad source shape:
          <a id="p-234a"></a>
          a) in den Fällen der [§§ 234a](#p-234a) ...

      Some Markdown renderers then leave the link syntax literal because the
      following prose is swallowed into the HTML block.

      Fix:
      - Convert Lawking anchor lines to span anchors.
      - Surround them with blank lines so the next legal text is parsed as Markdown.
    */
    return String(md || "").replace(
      /^\s*<a\s+id="([^"]+)"><\/a>\s*$/gm,
      (_match, id) => `\n<span id="${attrEscape(id)}"></span>\n`
    );
  }

  function markdownToHtml(md) {
    let html;
    const prepared = prepareMarkdownForRenderer(md);

    if (window.marked && window.marked.parse) {
      html = window.marked.parse(prepared, {
        gfm: true,
        breaks: false,
        mangle: false,
        headerIds: false,
      });
    } else {
      html = fallbackMarkdownToHtml(prepared);
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

  function normalizeBookPath(path) {
    let clean = String(path || "").replace(/^\.?\//, "").replace(/\\/g, "/");

    if (!clean) {
      return "";
    }

    if (!clean.endsWith("index.md")) {
      clean = clean.replace(/\/$/, "") + "/index.md";
    }

    return clean;
  }

  function bookByMarkdownPath(path) {
    const clean = normalizeBookPath(path);
    const withoutGesetze = clean.replace(/^gesetze\//, "");
    const withGesetze = clean.startsWith("gesetze/") ? clean : "gesetze/" + clean;

    return books.find(b => {
      const bookPath = normalizeBookPath(b.path || b.markdown || "");
      return bookPath === clean || bookPath === withoutGesetze || bookPath === withGesetze;
    });
  }

  function pseudoBookFromPath(path) {
    const clean = normalizeBookPath(path);
    const dir = clean.split("/").slice(-2, -1)[0] || clean;

    return {
      path: clean,
      title: dir.toUpperCase(),
      jurabk: dir.toUpperCase(),
      virtual: true,
    };
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

  function routeUrl(path, hash = "") {
    const url = new URL(window.location.href);
    url.searchParams.set("book", path);

    if (hash) {
      url.searchParams.set("anchor", hash);
    } else {
      url.searchParams.delete("anchor");
    }

    return url.pathname + url.search + url.hash;
  }

  function pushBookRoute(path, hash = "") {
    const state = {
      type: "book",
      path,
      hash,
    };

    const next = routeUrl(path, hash);
    const current = window.location.pathname + window.location.search + window.location.hash;

    if (next !== current) {
      history.pushState(state, "", next);
    } else {
      history.replaceState(state, "", next);
    }
  }

  function replaceHomeRoute() {
    const url = new URL(window.location.href);
    url.searchParams.delete("book");
    url.searchParams.delete("anchor");
    history.replaceState({ type: "home" }, "", url.pathname + url.search + url.hash);
  }

  function readBookRoute() {
    const url = new URL(window.location.href);
    const path = url.searchParams.get("book");
    const hash = url.searchParams.get("anchor") || "";

    if (!path) {
      return null;
    }

    return { path, hash };
  }

  function rememberScrollState() {
    const state = history.state || {};
    const nextState = {
      ...state,
      scrollTop: elViewer().scrollTop,
    };

    history.replaceState(
      nextState,
      "",
      window.location.pathname + window.location.search + window.location.hash
    );
  }

  function restoreScrollState(scrollTop) {
    if (typeof scrollTop !== "number") {
      return false;
    }

    requestAnimationFrame(() => {
      elViewer().scrollTop = scrollTop;
    });

    return true;
  }

  async function openBook(path, hash = "", pushRoute = true, scrollTop = null) {
    const book = bookByMarkdownPath(path) || pseudoBookFromPath(path);

    currentBook = book;
    markActiveBook(book.virtual ? "" : book.path);

    if (pushRoute) {
      rememberScrollState();
      pushBookRoute(book.path, hash);
    }

    setViewerLoading(`Lade ${book.title || book.path}...`);

    try {
      const loaded = await loadText(book.path);
      book.loadedPath = loaded.path;
      elViewer().innerHTML = markdownToHtml(loaded.text);
      wireViewerLinks();
      applyKnowledgeTooltips(elViewer());

      if (window.LAWKING_LAST_SEARCH) {
        highlightViewer(window.LAWKING_LAST_SEARCH);
      }

      if (restoreScrollState(scrollTop)) {
        return;
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

  function canonicalBookKey(item) {
    return String(item.path || item.book || item.title || "")
      .replace(/^\.\//, "")
      .replace(/\\/g, "/")
      .replace(/\/index\.md$/, "")
      .toLowerCase();
  }

  function dedupeBookResults(results) {
    const seen = new Set();
    const unique = [];

    for (const result of results) {
      const key = canonicalBookKey(result.item || result);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      unique.push(result);
    }

    return unique;
  }

  async function searchOnline(parsed, seq) {
    const url = new URL(searchApi, window.location.href);
    url.searchParams.set("q", parsed.raw);
    url.searchParams.set("max", "100");

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(res.status + " " + res.statusText);
    }

    const payload = await res.json();

    if (seq !== searchSeq) {
      return;
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const total = Number.isFinite(payload.total) ? payload.total : results.length;
    const mode = payload.mode || (parsed.mode === "regex" ? "regex" : parsed.mode === "wildcard" ? "wildcard" : "text");

    setSearchStatus(`${total} Online-${mode}-Treffer${total > results.length ? `, zeige ${results.length}` : ""}.`);
    renderSearchResults(results.map(item => ({ item })), parsed);
  }

  function renderSearchResults(shown, parsed) {
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

  async function doSearchNow(query) {
    const seq = ++searchSeq;
    const parsed = parseSearchQuery(query);

    window.LAWKING_LAST_SEARCH = parsed;

    if (!parsed.raw) {
      elResults().innerHTML = "";
      const chunkInfo = searchApi ? "Online-Suche" : `${searchIndex.length} durchsuchbare Abschnitte`;
      setSearchStatus(`${books.length} Bücher, ${chunkInfo}.`);
      return;
    }

    if (parsed.raw.length < SEARCH_MIN_CHARS) {
      elResults().innerHTML = "";
      setSearchStatus(`Bitte mindestens ${SEARCH_MIN_CHARS} Zeichen eingeben.`);
      return;
    }

    if (parsed.mode === "bad-regex") {
      elResults().innerHTML = "";
      setSearchStatus(`Ungültiger regulärer Ausdruck: ${parsed.error}`);
      return;
    }

    if (searchApi) {
      setSearchStatus("Suche online...", true);

      try {
        await searchOnline(parsed, seq);
      } catch (e) {
        if (seq === searchSeq) {
          elResults().innerHTML = "";
          setSearchStatus(`Online-Suche fehlgeschlagen: ${e.message}`);
        }
      }

      return;
    }

    setSearchStatus("Suche lokal...", true);

    const results = [];

    for (const item of searchIndex) {
      const score = scoreItem(item, parsed);

      if (score > 0) {
        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const uniqueResults = dedupeBookResults(results);
    const max = 100;
    const shown = uniqueResults.slice(0, max);
    const mode = parsed.mode === "regex" ? "regex" : parsed.mode === "wildcard" ? "wildcard" : "text";

    setSearchStatus(`${uniqueResults.length} eindeutige Gesetzbuch-${mode}-Treffer${results.length !== uniqueResults.length ? ` aus ${results.length} Abschnitten` : ""}${uniqueResults.length > max ? `, zeige ${max}` : ""}.`);
    renderSearchResults(shown, parsed);
  }

  function doSearchDebounced(query) {
    clearTimeout(searchTimer);

    const raw = String(query || "").trim();

    if (raw && raw.length >= SEARCH_MIN_CHARS) {
      setSearchStatus(`Suche startet in ${SEARCH_DELAY_MS} ms...`, true);
    }

    searchTimer = setTimeout(() => doSearchNow(query), SEARCH_DELAY_MS);
  }

  async function init() {
    document.body.classList.add("app-initializing");
    setViewerLoading("Initialisiere Lawking...");
    setSearchStatus("Lade Bücher und WissenDB...", true);
    books = await loadJson("data/books.json", []);
    knowledge = await loadJson("knowledge.json", []);
    prepareKnowledgeTerms();
    initKnowledgePanel();
    renderKnowledge();
    searchApi = String(window.LAWKING_SEARCH_API || "").trim();

    if (!searchApi) {
      searchIndex = await loadJson("data/search-index.json", []);
    }

    renderBooks();
    setSearchStatus(searchApi
      ? `${books.length} Bücher, Online-Suche.`
      : `${books.length} Bücher, ${searchIndex.length} durchsuchbare Abschnitte.`);

    document.body.classList.remove("app-initializing");

    elSearch().addEventListener("input", ev => doSearchDebounced(ev.target.value));

    let scrollRememberTimer = null;
    elViewer().addEventListener("scroll", () => {
      clearTimeout(scrollRememberTimer);
      scrollRememberTimer = setTimeout(rememberScrollState, 150);
    });

    window.addEventListener("beforeunload", rememberScrollState);

    window.addEventListener("popstate", ev => {
      const route = readBookRoute();
      const scrollTop = ev.state && typeof ev.state.scrollTop === "number"
        ? ev.state.scrollTop
        : null;

      if (route) {
        openBook(route.path, route.hash, false, scrollTop);
      } else {
        openHome(false, scrollTop);
      }
    });

    const route = readBookRoute();

    if (route) {
      openBook(route.path, route.hash, false);
    } else {
      history.replaceState({ type: "home" }, "", window.location.pathname + window.location.search + window.location.hash);
      openHome(false);
    }
  }

  function openHome(pushRoute = true, scrollTop = null) {
    currentBook = null;
    markActiveBook("");

    if (pushRoute) {
      rememberScrollState();

      const url = new URL(window.location.href);
      url.searchParams.delete("book");
      url.searchParams.delete("anchor");
      history.pushState({ type: "home" }, "", url.pathname + url.search + url.hash);
    }

    elViewer().innerHTML = `
      <div class="welcome">
        <h1>Lawking</h1>
        <p>Deutscher Gesetzesbrowser mit geprüften Links, Suchfunktion und Wissens-Hinweisen.</p>
        <p>Links suchen oder ein Gesetzbuch öffnen.</p>
      </div>
    `;

    if (!restoreScrollState(scrollTop)) {
      elViewer().scrollTop = 0;
    }
  }

  return { init, openBook, openHome };
})();

window.addEventListener("DOMContentLoaded", Lawking.init);
