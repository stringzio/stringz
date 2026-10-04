/** Docs site routes (stringz#89). Markdown sources in server/docs/ render
 *  server-side into the shell: grouped sidebar, filter search, and two
 *  index-only content tokens - [[illustration]] and [[cards]] - so the index
 *  markdown stays plain and reviewable. */

import { Hono } from "hono";
import { marked } from "marked";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { heroFigure } from "./illustration";
import { navSections, pageHref, pageList, sectionLabelFor, SLUG_RE, docsDir } from "./pages";
import { SHELL } from "./shell";

const ASSET_RE = /^[a-z0-9][a-z0-9-]*\.(webp|png|jpg)$/;
const ASSET_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fullTitle(title: string): string {
  return /docs$/i.test(title) || title.includes("Documentation")
    ? title
    : `${title} · Stringz Docs`;
}

function renderBody(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string;
  return html
    .replace("<p>[[illustration]]</p>", heroFigure())
    .replace("<p>[[cards]]</p>", "[[cards]]"); // cards injected after title handling
}

function cardsHtml(excludeSlug: string): string {
  const sections = navSections(pageList());
  const cards = sections
    .flatMap((s) => s.pages.map((p) => ({ section: s.label, ...p })))
    .filter((p) => p.slug !== excludeSlug);
  if (cards.length === 0) return "";
  return `<div class="cards">${cards
    .map(
      (p) => `<a class="card" href="${pageHref(p.slug)}">
      <span class="section">${escapeHtml(p.section)}</span>
      <h3>${escapeHtml(p.title)}<span class="arrow">&rarr;</span></h3>
      <p>${escapeHtml(p.excerpt)}</p>
    </a>`,
    )
    .join("")}</div>`;
}

function renderPage(slug: string): string | null {
  const file = resolve(docsDir, `${slug}.md`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const pages = pageList();
  const sections = navSections(pages);
  const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? "Docs";

  let body = renderBody(raw);
  body = body.replace("[[cards]]", slug === "index" ? cardsHtml(slug) : "");

  const navHtml = sections
    .map((s) => {
      const items = s.pages
        .map((p) => {
          const active = p.slug === slug;
          const search = escapeHtml(`${p.title} ${s.label} ${p.text}`);
          return `      <li class="side-item"><a class="side-link${active ? " active" : ""}" href="${pageHref(p.slug)}" data-slug="${p.slug}" data-search="${search}">${escapeHtml(p.title)}</a></li>`;
        })
        .join("\n");
      return `    <ul class="side-group">\n      <li class="side-label">${escapeHtml(s.label)}</li>\n${items}\n    </ul>`;
    })
    .join("\n");

  const searchIndex = sections.flatMap((s) =>
    s.pages.map((p) => ({ slug: pageHref(p.slug), title: p.title, section: s.label })),
  );

  return SHELL({
    fullTitle: fullTitle(title),
    eyebrow: slug === "index" ? "Overview" : sectionLabelFor(sections, slug),
    body,
    navHtml,
    searchIndex,
  });
}

export const docsApp = new Hono();

docsApp.get("/assets/:file", (c) => {
  const file = c.req.param("file");
  if (!ASSET_RE.test(file)) return c.text("not found", 404);
  const path = resolve(docsDir, "assets", file);
  if (!existsSync(path)) return c.text("not found", 404);
  const ext = file.split(".").pop() ?? "webp";
  return new Response(readFileSync(path), {
    headers: {
      "content-type": ASSET_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
    },
  });
});

docsApp.get("/", (c) => {
  const html = renderPage("index");
  return html ? c.html(html) : c.text("docs index missing", 404);
});

docsApp.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) return c.text("not found", 404);
  const html = renderPage(slug);
  return html ? c.html(html) : c.text("not found", 404);
});
