/** Docs site (stringz#89 phase 1). Markdown sources live in server/docs/ and
 *  render server-side into a small static shell - no client bundle, no build
 *  step, reviewable as plain markdown. Served from this api service at /docs
 *  today; docs.stringz.xyz falls out of the parked domain phase (#80) with a
 *  pure infra change. */

import { Hono } from "hono";
import { marked } from "marked";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const docsDir = resolve(import.meta.dir, "../docs");
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/; // no traversal, no odd filenames

interface DocPage {
  slug: string;
  title: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pageList(): DocPage[] {
  if (!existsSync(docsDir)) return [];
  return readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") && SLUG_RE.test(f.replace(/\.md$/, "")))
    .sort()
    .map((f) => {
      const raw = readFileSync(resolve(docsDir, f), "utf8");
      const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? f.replace(/\.md$/, "");
      return { slug: f.replace(/\.md$/, ""), title };
    });
}

const SHELL = (title: string, nav: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} - Stringz Docs</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; background: #fafaf8; }
  header { display: flex; align-items: center; justify-content: space-between; max-width: 760px; margin: 0 auto; padding: 20px 24px; border-bottom: 1px solid #e4e4de; }
  header .brand { font-weight: 800; letter-spacing: -0.02em; text-decoration: none; color: #1a1a1a; }
  header nav a { margin-left: 18px; font-size: 13px; color: #7a7a74; text-decoration: none; }
  header nav a:hover { color: #1a1a1a; }
  nav.pages { max-width: 760px; margin: 20px auto 0; padding: 0 24px; display: flex; flex-wrap: wrap; gap: 8px 16px; }
  nav.pages a { font-size: 13px; color: #3f6b4f; text-decoration: none; font-weight: 600; }
  main { max-width: 760px; margin: 0 auto; padding: 12px 24px 64px; line-height: 1.65; font-size: 15px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 20px 0 8px; }
  h2 { font-size: 20px; margin: 32px 0 8px; letter-spacing: -0.01em; }
  p, li { color: #3d3d38; }
  a { color: #3f6b4f; }
  code { background: #f0f0ec; border-radius: 4px; padding: 1px 5px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #171717; color: #f4f4f0; border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; padding: 0; color: inherit; }
  blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid #3f6b4f; background: #eef3ef; border-radius: 0 8px 8px 0; }
  blockquote p { margin: 0; }
  footer { max-width: 760px; margin: 0 auto; padding: 20px 24px 40px; border-top: 1px solid #e4e4de; font-size: 12px; color: #8a8a83; }
</style>
</head>
<body>
<header>
  <a class="brand" href="/docs">Stringz Docs</a>
  <nav>
    <a href="/">App</a>
    <a href="https://github.com/stringzio/stringz" rel="noreferrer">GitHub</a>
  </nav>
</header>
${nav}
<main>${body}</main>
<footer>Tooling only - Stringz never holds your keys, funds, or signatures.</footer>
</body>
</html>`;

function renderPage(slug: string): string | null {
  const file = resolve(docsDir, `${slug}.md`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const body = marked.parse(raw, { async: false });
  const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? "Docs";
  const nav = `<nav class="pages">${pageList()
    .filter((p) => p.slug !== slug)
    .map((p) => `<a href="/docs/${p.slug === "index" ? "" : p.slug}">${escapeHtml(p.title)}</a>`)
    .join("")}</nav>`;
  return SHELL(title, nav, body);
}

export const docsApp = new Hono();

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
