/** Docs page discovery and navigation structure (stringz#89). Markdown sources
 *  live in server/docs/<slug>.md; the sidebar groups below define the order and
 *  section labels. Slugs listed here that have no file yet are skipped, so the
 *  nav grows as pages land without touching this module. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const docsDir = resolve(import.meta.dir, "../../docs");
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/; // no traversal, no odd filenames

export interface DocPage {
  slug: string;
  title: string;
  excerpt: string;
  /** Plain-text body for the filter search. */
  text: string;
}

export interface NavSection {
  label: string;
  pages: DocPage[];
}

const mdToText = (s: string): string =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>]/g, "")
    .trim();

function excerptOf(raw: string): string {
  const afterTitle = raw.replace(/^#\s+.+$/m, "");
  const block = afterTitle
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith("[[") && !b.startsWith("!"))
    .find((b) => !/^#{1,6}\s/.test(b));
  const text = mdToText(block ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, text.lastIndexOf(" ", 157))}…`;
}

export function pageList(): DocPage[] {
  if (!existsSync(docsDir)) return [];
  return readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") && SLUG_RE.test(f.replace(/\.md$/, "")))
    .sort()
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = readFileSync(resolve(docsDir, f), "utf8");
      const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? slug;
      return {
        slug,
        title,
        excerpt: excerptOf(raw),
        text: mdToText(raw).replace(/\s+/g, " ").slice(0, 2000),
      };
    });
}

export function pageHref(slug: string): string {
  return slug === "index" ? "/docs" : `/docs/${slug}`;
}

/** Ordered sidebar. "index" belongs to no section; it is the docs home and is
 *  reachable from the header logo. */
const SECTION_SLUGS: { label: string; slugs: string[] }[] = [
  {
    label: "Getting Started",
    slugs: ["what-is-stringz", "how-it-works", "who-it-helps"],
  },
  {
    label: "Guides",
    slugs: ["tutorial-first-flow"],
  },
];

export function navSections(pages: DocPage[]): NavSection[] {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const placed = new Set<string>();
  const sections: NavSection[] = SECTION_SLUGS.map(({ label, slugs }) => {
    const found = slugs
      .map((s) => bySlug.get(s))
      .filter((p): p is DocPage => Boolean(p));
    found.forEach((p) => placed.add(p.slug));
    return { label, pages: found };
  }).filter((s) => s.pages.length > 0);
  const rest = pages.filter((p) => !placed.has(p.slug) && p.slug !== "index");
  if (rest.length > 0) sections.push({ label: "More", pages: rest });
  return sections;
}

export function sectionLabelFor(sections: NavSection[], slug: string): string {
  return sections.find((s) => s.pages.some((p) => p.slug === slug))?.label ?? "Documentation";
}

export { SLUG_RE, docsDir };
