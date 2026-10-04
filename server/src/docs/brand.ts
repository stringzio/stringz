/** Shared brand assets for the docs shell (stringz#89): the same logo mark
 *  and palette as the app (src/components/LogoMark.tsx), inlined so the docs
 *  pages need no client bundle or asset pipeline. */

export const BRAND = {
  ink: "#171717",
  body: "#3d3d38",
  muted: "#6d6d66",
  faint: "#9a9a93",
  page: "#f7f7f4",
  surface: "#ffffff",
  border: "#e7e7e0",
  hover: "#f0f0ea",
  green: "#3f6b4f",
  greenDeep: "#2f5440",
  greenTint: "#eaf2ea",
  rose: "#c0435a",
  amber: "#b07d2b",
  amberTint: "#fdf3e3",
  blue: "#3d5f8a",
  blueTint: "#edf3f8",
} as const;

/** viewBox matches the app's LogoMark (640x900). Gradient id is namespaced to
 *  the docs pages so it can never collide with the app's own mount. */
export const LOGO_MARK = `<svg viewBox="0 0 640 900" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="sz-doc-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#DFF0E3" />
    <stop offset="100%" stop-color="#5E8A6F" />
  </linearGradient>
</defs>
<path d="M320,20 A90,90 0 1 1 319,20 Z" fill="url(#sz-doc-g)" />
<path d="M195,270 A52,52 0 0 1 320,218 L410,270 A52,52 0 0 1 320,322 Z" fill="url(#sz-doc-g)" />
<path d="M320,355 A95,95 0 1 1 319,355 Z M320,400 A50,50 0 1 0 319,400 Z" fill="url(#sz-doc-g)" fill-rule="evenodd" />
<path d="M445,630 A52,52 0 0 0 320,578 L230,630 A52,52 0 0 0 320,682 Z" fill="url(#sz-doc-g)" />
<path d="M320,700 A90,90 0 1 1 319,700 Z" fill="url(#sz-doc-g)" />
</svg>`;
