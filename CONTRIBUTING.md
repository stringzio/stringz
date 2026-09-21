# Contributing to Signalz

Thanks for your interest in Signalz.

## Setup

```bash
bun install
bun run dev
```

## Ground rules

- `bun run build` must pass before you open a PR (it runs `tsc -b` in strict mode; unused imports fail the build).
- `bun run lint:app` must stay clean (the 11 errors in the vendored shadcn/ui files are pre-existing - leave them be).
- Keep the tooling-only constraint intact: no feature, copy, or generated code may ask for, hold, or imply custody of keys, funds, or signatures.
- Prefer small, verified changes over broad refactors.
- Match the existing code style (Tailwind utility classes, Lucide icons, Lexend Deca).

## Where things live

- `src/sections/CanvasScreen.tsx` - the builder canvas
- `src/compiler/` - Blueprint IR (`schema.ts`) and the Chainlink CRE project generator (`cre.ts`)
- `src/web3/priceFeeds.ts` - verified Chainlink feed registry + live price reads
- `src/web3/chainReads.ts` - Multicall3 balance reads + the mainnet Fast Gas feed
- `src/lib/flowData.ts` + `src/lib/liveRun.ts` - run executor, expression resolver, live on-chain prefetch
- `src/pages/` - landing, waitlist, auth, legal

## CI

GitHub Actions runs the build, server typecheck, and `lint:app` on every PR; the Playwright browser suite runs as a non-blocking job until it proves stable.

## Reporting issues

Open an issue with repro steps and, if visual, a screenshot. Security issues: please email hello@stringz.io instead of opening a public issue.
