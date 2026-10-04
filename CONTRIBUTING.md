# Contributing to Stringz

Thanks for helping build the "n8n for Web3". This guide covers a local setup
and the rules that keep the project safe to use.

## Setup

```bash
git clone https://github.com/stringzio/stringz.git
cd stringz
bun install
cp .env.example .env          # fill in DATABASE_URL at minimum
docker compose -f compose.yaml up -d postgres   # or point DATABASE_URL elsewhere
bun run dev:all               # web on :3000, api on :8787
```

The API applies database migrations automatically at boot
(drizzle-orm migrator over `server/src/db/migrations`), so a fresh Postgres
reaches a working state on first run.

## Checks to run before opening a PR

```bash
bun run build        # tsc project refs + vite build
bun run lint:app     # eslint (app code; ui/ primitives and hooks are vendored)
cd server && bun run typecheck
bun runner/test/contract-test.ts   # canvas -> CRE zip contract (63 checks)
```

For billing-surface changes also run the wire check
(`server/test/verify-wire-check.ts`, see its header for the env it needs) -
it pins the exact JSON shape the browser receives from every billing outcome.

Secrets: the repo is scanned with gitleaks (`.gitleaks.toml`, allowlisted
test fixtures only). Run `gitleaks detect --source .` on your branch; a hit
blocks merge.

## Project map

- `src/sections/CanvasScreen.tsx` - the builder canvas
- `src/compiler/` - Blueprint IR (`schema.ts`) and the Chainlink CRE project
  generator (`cre.ts`)
- `src/web3/priceFeeds.ts` - verified Chainlink feed registry + live reads
- `src/web3/chainReads.ts` - Multicall3 balance reads + the mainnet Fast Gas feed
- `src/lib/flowData.ts` + `src/lib/liveRun.ts` - run executor, expression
  resolver, live on-chain prefetch
- `src/lib/pricing.ts` - plan catalog + chain/token destinations (mirrors the rail)
- `server/src/` - Bun + Hono + tRPC + Drizzle API (auth, flows, simulate
  orchestration, billing proxy, admin)
- `runner/` - the Cloud Run job that executes cloud simulations
- `server/src/stringzPay.ts` - thin client for the internal payment rail

## Ground rules

1. **Tooling only.** Stringz never holds user keys, funds, or signatures. Do
   not add any feature, copy, or generated code that asks for a private key
   or seed phrase. Generated workflows run under the user's own CRE account
   with their own secrets.
2. Match the existing style: Tailwind utility classes, Lucide icons, Lexend
   Deca type, small modules, comments that explain *why*.
3. Every user-facing surface (pricing, limits, error copy) has one shared
   source in `src/lib/` - extend it rather than hardcoding second copies.
4. Billing and auth changes must ship with the wire check updated when the
   browser-visible shape changes.

## Reporting bugs

File an issue. For security problems see [SECURITY.md](SECURITY.md) instead
of opening a public issue.
