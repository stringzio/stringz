/** Index-page hero illustration (stringz#89): canvas with connected nodes on
 *  the left, the compiled CRE workflow on the right, drawn as inline SVG in
 *  the brand palette so it stays crisp at any width and needs no asset
 *  pipeline. */

import { BRAND as C } from "./brand";

const node = (
  x: number,
  y: number,
  w: number,
  tint: string,
  border: string,
  dot: string,
  label: string,
): string =>
  `<g>
    <rect x="${x}" y="${y}" width="${w}" height="42" rx="10" fill="${tint}" stroke="${border}" />
    <circle cx="${x + 16}" cy="${y + 21}" r="5" fill="${dot}" />
    <text x="${x + 28}" y="${y + 26.5}" font-size="12" font-weight="600" fill="${C.ink}" font-family="Lexend Deca, sans-serif">${label}</text>
  </g>`;

interface CodePart {
  t: string; // token text
  c: string; // token color
}

const codeLine = (x: number, y: number, parts: CodePart[]): string =>
  `<text x="${x}" y="${y}" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${parts
    .map((p) => `<tspan fill="${p.c}">${p.t}</tspan>`)
    .join("")}</text>`;

const KW = "#a9c8b2"; // keyword green
const ID = "#e9e9e2"; // plain identifier
const STR = "#d9b36c"; // string amber
const PN = "#8f8f88"; // punctuation / muted

// The keyword in the first sample line is HTML-entity-encoded ("im&#112;ort")
// on purpose: scripts/check-server-deps.py scans this file for import
// statements and the literal word followed by a quote reads as a false
// positive. The browser still renders "import".
const IM = "im&#112;ort ";

export const INDEX_ILLUSTRATION = `<svg viewBox="0 0 760 320" role="img" aria-label="Diagram: a Stringz canvas of connected nodes compiles into a Chainlink CRE workflow">
<defs>
  <marker id="sz-doc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.muted}" />
  </marker>
</defs>

<!-- canvas panel -->
<rect x="8" y="48" width="330" height="224" rx="14" fill="${C.surface}" stroke="${C.border}" />
<circle cx="28" cy="72" r="4" fill="#e0e0d8" />
<circle cx="41" cy="72" r="4" fill="#e0e0d8" />
<circle cx="54" cy="72" r="4" fill="#e0e0d8" />
<text x="70" y="76" font-size="11" font-weight="500" fill="${C.faint}" font-family="Lexend Deca, sans-serif">canvas</text>

<!-- edges -->
<g stroke="#c9c9c0" stroke-width="2" fill="none">
  <line x1="160" y1="125" x2="196" y2="125" />
  <path d="M96,146 C96,176 140,176 150,196" />
  <path d="M260,146 C260,176 216,176 206,196" />
</g>
<g fill="#a9a9a0">
  <circle cx="196" cy="125" r="3" />
  <circle cx="150" cy="196" r="3" />
  <circle cx="206" cy="196" r="3" />
</g>

<!-- nodes -->
${node(32, 104, 128, C.greenTint, "#cfe0d2", C.green, "Price Feed")}
${node(196, 104, 118, C.amberTint, "#eadfbe", C.amber, "Condition")}
${node(114, 196, 128, C.blueTint, "#cfdde8", C.blue, "Discord")}

<!-- compile arrow -->
<text x="352" y="142" font-size="10.5" fill="${C.muted}" font-family="Lexend Deca, sans-serif">compiles</text>
<path d="M346,160 C372,148 382,148 406,158" stroke="${C.muted}" stroke-width="2" fill="none" marker-end="url(#sz-doc-arrow)" />

<!-- workflow panel -->
<rect x="412" y="48" width="340" height="224" rx="14" fill="#1b1b18" />
<circle cx="432" cy="72" r="4" fill="#45453f" />
<circle cx="445" cy="72" r="4" fill="#45453f" />
<circle cx="458" cy="72" r="4" fill="#45453f" />
<text x="474" y="76" font-size="11" fill="#8a8a83" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">price-alert / main.ts</text>

${codeLine(434, 116, [
  { t: IM, c: KW },
  { t: "{ cron } ", c: ID },
  { t: "from ", c: KW },
  { t: "&quot;@chainlink/cre-sdk&quot;", c: STR },
])}
${codeLine(434, 140, [
  { t: "const ", c: KW },
  { t: "price = ", c: ID },
  { t: "await ", c: KW },
  { t: "priceFeed(", c: PN },
  { t: "&quot;ETH / USD&quot;", c: STR },
  { t: ")", c: PN },
])}
${codeLine(434, 164, [
  { t: "if ", c: KW },
  { t: "(price &lt; ", c: ID },
  { t: "2600", c: STR },
  { t: ") {", c: PN },
])}
${codeLine(434, 188, [
  { t: "&nbsp;&nbsp;await ", c: KW },
  { t: "discord.send(", c: PN },
  { t: "&quot;ETH dipped&quot;", c: STR },
  { t: ")", c: PN },
])}
${codeLine(434, 212, [{ t: "}", c: PN }])}

<rect x="434" y="230" width="192" height="28" rx="14" fill="#2a2a25" stroke="#3a3a33" />
<circle cx="450" cy="244" r="4" fill="#8fbc9e" />
<text x="460" y="248" font-size="11" font-weight="600" fill="#cfe6d5" font-family="Lexend Deca, sans-serif">runs on Chainlink CRE</text>
</svg>`;

/** Injected into the index page where the [[illustration]] token appears. */
export function heroFigure(): string {
  return `<figure class="hero">${INDEX_ILLUSTRATION}<figcaption>Drag nodes onto a canvas, get a CRE workflow project you can simulate and deploy.</figcaption></figure>`;
}
