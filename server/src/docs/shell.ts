/** HTML shell + styles for the docs site (stringz#89). Server-rendered, zero
 *  client bundle: the only inline script wires the sidebar filter search, the
 *  "/" shortcut, and the mobile nav drawer. */

import { BRAND, LOGO_MARK } from "./brand";

export interface ShellInput {
  /** Page <title>; pass the already-suffixed value from the caller. */
  fullTitle: string;
  eyebrow: string;
  body: string;
  /** Sidebar HTML: <ul class="side-group"> blocks from the caller. */
  navHtml: string;
  /** Flat page index for the filter search. */
  searchIndex: { slug: string; title: string; section: string }[];
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    font-family: "Lexend Deca", -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif;
    color: ${BRAND.ink};
    background: ${BRAND.page};
    font-size: 15.5px;
    line-height: 1.65;
  }
  a { color: ${BRAND.green}; text-decoration: none; }

  /* ---------- top bar ---------- */
  .topbar {
    position: sticky; top: 0; z-index: 50;
    background: ${BRAND.surface};
    border-bottom: 1px solid ${BRAND.border};
  }
  .topbar-inner {
    max-width: 1180px; margin: 0 auto; height: 60px;
    display: flex; align-items: center; gap: 18px; padding: 0 24px;
  }
  .brand { display: flex; align-items: center; gap: 10px; color: ${BRAND.ink}; font-weight: 800; font-size: 17px; letter-spacing: -0.01em; white-space: nowrap; }
  .brand .mark {
    width: 30px; height: 30px; border-radius: 9px; background: ${BRAND.ink};
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .brand .mark svg { width: 13px; height: auto; }
  .brand .sep { width: 1px; height: 18px; background: ${BRAND.border}; }
  .brand .docs-label { font-weight: 600; color: ${BRAND.muted}; font-size: 14px; }
  .menu-btn {
    display: none; border: 1px solid ${BRAND.border}; background: ${BRAND.surface};
    border-radius: 9px; width: 36px; height: 36px; cursor: pointer;
    color: ${BRAND.ink}; align-items: center; justify-content: center; flex: none;
  }

  .search { flex: 1; max-width: 420px; margin: 0 auto; position: relative; }
  .search svg.mag {
    position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
    width: 14px; height: 14px; color: ${BRAND.faint}; pointer-events: none;
  }
  .search input {
    width: 100%; height: 37px; border: 1px solid ${BRAND.border}; border-radius: 10px;
    background: ${BRAND.page}; padding: 0 64px 0 33px; font: inherit; font-size: 13.5px;
    color: ${BRAND.ink}; outline: none; transition: border-color .12s, background .12s, box-shadow .12s;
  }
  .search input::placeholder { color: ${BRAND.faint}; }
  .search input:focus {
    border-color: ${BRAND.green}; background: ${BRAND.surface};
    box-shadow: 0 0 0 3px rgba(63, 107, 79, 0.14);
  }
  .search kbd {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    border: 1px solid ${BRAND.border}; border-bottom-width: 2px; border-radius: 5px;
    background: ${BRAND.surface}; color: ${BRAND.faint}; font-size: 11px;
    font-family: inherit; padding: 1px 6px; pointer-events: none;
  }
  .search .no-match {
    position: absolute; left: 0; right: 0; top: 42px; background: ${BRAND.surface};
    border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 10px 14px;
    font-size: 13px; color: ${BRAND.muted}; display: none; box-shadow: 0 8px 24px rgba(23,23,23,.08);
  }
  .search .no-match.show { display: block; }

  .toplinks { display: flex; align-items: center; gap: 4px; }
  .toplinks a {
    padding: 7px 11px; border-radius: 9px; font-size: 13.5px; color: ${BRAND.body};
    white-space: nowrap;
  }
  .toplinks a:hover { background: ${BRAND.hover}; color: ${BRAND.ink}; }
  .toplinks a.cta {
    background: ${BRAND.ink}; color: #fff; font-weight: 600; margin-left: 6px;
    padding: 8px 14px; border-radius: 10px;
  }
  .toplinks a.cta:hover { background: #000; }

  /* ---------- layout ---------- */
  .layout { max-width: 1180px; margin: 0 auto; display: flex; gap: 36px; padding: 0 24px; }
  aside#sidebar {
    width: 248px; flex: none; position: sticky; top: 60px;
    height: calc(100vh - 60px); overflow-y: auto;
    padding: 30px 4px 48px 0; scrollbar-width: thin;
  }
  ul.side-group { list-style: none; margin: 0 0 6px; padding: 0; }
  li.side-label {
    list-style: none; font-size: 11px; font-weight: 700; color: ${BRAND.faint};
    text-transform: uppercase; letter-spacing: .07em; margin: 20px 10px 6px;
  }
  ul.side-group:first-child li.side-label { margin-top: 0; }
  li.side-item { list-style: none; margin: 1px 0; }
  a.side-link {
    display: block; padding: 6px 10px; border-radius: 8px; font-size: 13.5px;
    color: ${BRAND.body};
  }
  a.side-link:hover { background: ${BRAND.hover}; color: ${BRAND.ink}; }
  a.side-link.active { background: ${BRAND.greenTint}; color: ${BRAND.greenDeep}; font-weight: 600; }
  a.side-link mark { background: none; color: inherit; font-weight: 700; }

  main.content { min-width: 0; width: 100%; max-width: 740px; padding: 38px 0 90px; }
  .eyebrow { font-size: 13px; font-weight: 700; color: ${BRAND.green}; margin: 0 0 4px; }

  footer {
    border-top: 1px solid ${BRAND.border}; background: ${BRAND.surface};
  }
  .footer-inner {
    max-width: 1180px; margin: 0 auto; padding: 26px 24px 34px;
    display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; justify-content: space-between;
    font-size: 12.5px; color: ${BRAND.muted};
  }
  .footer-inner nav { display: flex; gap: 16px; }
  .footer-inner a { color: ${BRAND.muted}; }
  .footer-inner a:hover { color: ${BRAND.ink}; }

  /* ---------- prose ---------- */
  .prose h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; margin: 2px 0 16px; }
  .prose h2 { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; margin: 38px 0 10px; }
  .prose h3 { font-size: 17px; font-weight: 700; margin: 26px 0 8px; }
  .prose p { color: ${BRAND.body}; margin: 0 0 14px; }
  .prose ul, .prose ol { color: ${BRAND.body}; padding-left: 22px; margin: 0 0 14px; }
  .prose li { margin: 3px 0; }
  .prose li > p { margin: 0; }
  .prose a { border-bottom: 1px solid #d3e0d4; font-weight: 500; }
  .prose a:hover { border-bottom-color: ${BRAND.green}; }
  .prose strong { color: ${BRAND.ink}; }
  .prose code {
    background: #efefe9; border-radius: 5px; padding: 1.5px 6px; font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: ${BRAND.ink};
  }
  .prose pre {
    background: ${BRAND.ink}; color: #f2f2ec; border-radius: 12px;
    padding: 16px 18px; overflow-x: auto; margin: 16px 0; font-size: 13px; line-height: 1.6;
  }
  .prose pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
  .prose blockquote {
    margin: 16px 0; padding: 12px 16px; border-left: 3px solid ${BRAND.green};
    background: ${BRAND.greenTint}; border-radius: 0 10px 10px 0;
  }
  .prose blockquote p { margin: 0; }
  .prose hr { border: none; border-top: 1px solid ${BRAND.border}; margin: 30px 0; }
  .prose img { max-width: 100%; border-radius: 12px; }
  .prose table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  .prose th, .prose td { border: 1px solid ${BRAND.border}; padding: 8px 12px; text-align: left; }
  .prose th { background: ${BRAND.hover}; font-weight: 600; color: ${BRAND.ink}; }
  .prose td { color: ${BRAND.body}; }

  /* ---------- index cards ---------- */
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 26px 0 8px; }
  a.card {
    display: block; background: ${BRAND.surface}; border: 1px solid ${BRAND.border};
    border-radius: 14px; padding: 16px 18px 14px; color: ${BRAND.ink};
    transition: border-color .12s, box-shadow .12s;
  }
  a.card:hover { border-color: #c4d8c8; box-shadow: 0 6px 18px rgba(23, 23, 23, 0.06); }
  a.card h3 { margin: 0; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  a.card h3 .arrow { color: ${BRAND.green}; font-weight: 600; }
  a.card p { margin: 6px 0 0; font-size: 13px; color: ${BRAND.muted}; line-height: 1.55; }
  a.card .section { font-size: 11px; font-weight: 700; color: ${BRAND.faint}; text-transform: uppercase; letter-spacing: .06em; }

  figure.hero { margin: 26px 0 10px; }
  figure.hero svg { width: 100%; height: auto; display: block; }
  figcaption { text-align: center; font-size: 12.5px; color: ${BRAND.muted}; margin-top: 6px; }

  /* ---------- mobile ---------- */
  .scrim { display: none; }
  @media (max-width: 960px) {
    .menu-btn { display: flex; }
    .search { display: none; }
    .toplinks a:not(.cta) { display: none; }
    .brand .docs-label { display: none; }
    .brand .sep { display: none; }
    aside#sidebar {
      position: fixed; top: 0; left: 0; bottom: 0; z-index: 60; width: 280px;
      height: 100vh; background: ${BRAND.surface}; border-right: 1px solid ${BRAND.border};
      padding: 20px 12px 40px 20px; transform: translateX(-105%);
      transition: transform .18s ease;
    }
    aside#sidebar.open { transform: translateX(0); }
    .scrim {
      display: block; position: fixed; inset: 0; z-index: 55; background: rgba(23,23,23,.4);
      opacity: 0; pointer-events: none; transition: opacity .18s;
    }
    .scrim.show { opacity: 1; pointer-events: auto; }
    main.content { max-width: none; padding-top: 28px; }
    .layout { gap: 0; }
  }
`;

const SCRIPT = `
  var idx = __SEARCH_INDEX__;
  var input = document.getElementById("docsearch");
  var aside = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  var menuBtn = document.getElementById("menu-btn");
  var noMatch = document.getElementById("no-match");

  function links() { return Array.prototype.slice.call(aside.querySelectorAll("a.side-link")); }
  function groups() { return Array.prototype.slice.call(aside.querySelectorAll("ul.side-group")); }

  function setNav(open) {
    aside.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
  }
  if (menuBtn) menuBtn.addEventListener("click", function () { setNav(true); });
  scrim.addEventListener("click", function () { setNav(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setNav(false);
    if (e.key === "/" && input && document.activeElement !== input) {
      e.preventDefault(); input.focus();
    }
  });

  function filter(q) {
    q = q.trim().toLowerCase();
    var first = null;
    links().forEach(function (a) {
      var hay = (a.getAttribute("data-search") || "").toLowerCase();
      var hit = !q || hay.indexOf(q) !== -1;
      a.parentElement.style.display = hit ? "" : "none";
      if (hit && !first) first = a;
    });
    groups().forEach(function (g) {
      var any = Array.prototype.some.call(g.querySelectorAll("li.side-item"), function (li) {
        return li.style.display !== "none";
      });
      g.style.display = any ? "" : "none";
    });
    if (noMatch) noMatch.classList.toggle("show", !!q && !first);
    return first;
  }
  if (input) {
    input.addEventListener("input", function () { filter(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var first = filter(input.value); if (first) location.href = first.href; }
    });
  }
  aside.addEventListener("click", function (e) {
    if (e.target.closest("a")) setNav(false);
  });
`;

const MAG_ICON = `<svg class="mag" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.6" /><path d="M10.6 10.6 14 14" /></svg>`;
const MENU_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4.5h12M2 8h12M2 11.5h12" /></svg>`;

export function SHELL(i: ShellInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${i.fullTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <button class="menu-btn" id="menu-btn" aria-label="Open docs menu">${MENU_ICON}</button>
    <a class="brand" href="/docs">
      <span class="mark">${LOGO_MARK}</span>
      <span>Stringz</span>
      <span class="sep"></span>
      <span class="docs-label">Documentation</span>
    </a>
    <div class="search">
      ${MAG_ICON}
      <input id="docsearch" type="search" placeholder="Search docs" autocomplete="off" aria-label="Search docs" />
      <kbd>/</kbd>
      <div class="no-match" id="no-match">No matching pages.</div>
    </div>
    <nav class="toplinks">
      <a href="https://github.com/stringzio/stringz" rel="noreferrer">GitHub</a>
      <a class="cta" href="/">Open app</a>
    </nav>
  </div>
</header>
<div class="scrim" id="scrim"></div>
<div class="layout">
  <aside id="sidebar" aria-label="Docs navigation">
${i.navHtml}
  </aside>
  <main class="content">
    <p class="eyebrow">${i.eyebrow}</p>
    <div class="prose">${i.body}</div>
  </main>
</div>
<footer>
  <div class="footer-inner">
    <span>Tooling only - Stringz never holds your keys, funds, or signatures.</span>
    <nav>
      <a href="/">App</a>
      <a href="https://github.com/stringzio/stringz" rel="noreferrer">GitHub</a>
      <a href="https://github.com/stringzio/stringz/issues" rel="noreferrer">Support</a>
    </nav>
  </div>
</footer>
<script>${SCRIPT.replace("__SEARCH_INDEX__", JSON.stringify(i.searchIndex))}</script>
</body>
</html>`;
}
