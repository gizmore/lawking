const Lawking = (() => {
  let books = [];
  let searchIndex = [];
  let currentBook = null;

  const elBooks = () => document.getElementById("books");
  const elResults = () => document.getElementById("results");
  const elViewer = () => document.getElementById("viewer");
  const elSearch = () => document.getElementById("search");

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

  async function loadText(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status + " " + path);
    return await res.text();
  }

  function renderBooks() {
    elBooks().innerHTML = books.map(book => `
      <div class="book" data-path="${attrEscape(book.path)}">
        <span class="abbr">${htmlEscape(book.jurabk || book.slug || "")}</span>
        <span>${htmlEscape(book.title || book.path)}</span>
      </div>
    `).join("");

    elBooks().querySelectorAll(".book").forEach(node => {
      node.addEventListener("click", () => openBook(node.dataset.path));
    });
  }

function markdownToHtml(md) {
  const html = marked.parse(md, {
    gfm: true,
    breaks: false,
  });

  return `<div class="markdown">${highlightOops(html)}</div>`;
}

function highlightOops(html) {
  return html.replace(
    /\(Oops, ([^)]+)\)/g,
    '<span class="oops">(Oops, $1)</span>'
  );
}
    function flushParagraph() {
      if (!paragraph.length) return;
      const text = paragraph.join("\n");
      out.push(`<p>${inlineMarkdown(text)}</p>`);
      paragraph = [];
    }

    for (const line of lines) {
      if (line.startsWith("```") || line.startsWith("~~~")) {
        flushParagraph();
        inCode = !inCode;
        out.push(inCode ? "<pre><code>" : "</code></pre>");
        continue;
      }

      if (inCode) {
        out.push(htmlEscape(line) + "\n");
        continue;
      }

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
    return `<div class="markdown">${out.join("\n")}</div>`;
  }

  function inlineMarkdown(text) {
    let escaped = htmlEscape(text);

    escaped = escaped.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label, href) => `<a href="${attrEscape(href)}">${label}</a>`
    );

    escaped = escaped.replace(
      /\(Oops, ([^)]+)\)/g,
      '<span class="oops">(Oops, $1)</span>'
    );

    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

    return escaped;
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
    const currentDir = currentBook.path.split("/").slice(0, -1).join("/");
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

  async function openBook(path, hash = "") {
    const book = bookByMarkdownPath(path) || books.find(b => b.path === path);

    if (!book) {
      elViewer().innerHTML = `<p>Book not found: <code>${htmlEscape(path)}</code></p>`;
      return;
    }

    currentBook = book;
    const md = await loadText(book.path);
    elViewer().innerHTML = markdownToHtml(md);
    wireViewerLinks();

    if (hash) {
      scrollToHash(hash);
    } else {
      elViewer().scrollTop = 0;
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

  function doSearch(query) {
    const q = normalize(query);

    if (!q) {
      elResults().innerHTML = "";
      return;
    }

    const terms = q.split(" ").filter(Boolean);
    const results = [];

    for (const item of searchIndex) {
      const hay = item.search || normalize([
        item.book,
        item.jurabk,
        item.title,
        item.text,
      ].join(" "));

      let score = 0;

      for (const term of terms) {
        if (hay.includes(term)) score += 1;
      }

      if (score > 0) {
        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    elResults().innerHTML = results.slice(0, 80).map(({ item }) => `
      <div class="result" data-path="${attrEscape(item.path)}" data-anchor="${attrEscape(item.anchor || "")}">
        <div class="title">
          <span class="abbr">${htmlEscape(item.jurabk || "")}</span>
          ${htmlEscape(item.title || item.path)}
        </div>
        <div class="snippet">${htmlEscape(item.snippet || "")}</div>
      </div>
    `).join("");

    elResults().querySelectorAll(".result").forEach(node => {
      node.addEventListener("click", () => openBook(node.dataset.path, node.dataset.anchor));
    });
  }

  async function init() {
    books = await loadJson("data/books.json", []);
    searchIndex = await loadJson("data/search-index.json", []);
    renderBooks();

    elSearch().addEventListener("input", ev => doSearch(ev.target.value));

    const first = books[0];
    if (first) {
      // keep welcome page; user can click
    }
  }

  function openHome() {
    currentBook = null;
    elViewer().innerHTML = `
      <div class="welcome">
        <h1>Lawking</h1>
        <p>Offline legal Markdown browser with verified links and audit warnings.</p>
        <p>Search above or choose a book.</p>
      </div>
    `;
  }

  return { init, openBook, openHome };
})();

window.addEventListener("DOMContentLoaded", Lawking.init);
