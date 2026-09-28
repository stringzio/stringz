# Payment testing (local repro harness)

This is the local stand-in for a live wallet payment. Run the full stack on
this machine and exercise the checkout without touching production - the
process that replaced live-wallet debugging as the first diagnostic step.

## Pieces

| Process | Command | Notes |
|---|---|---|
| Web dev server | `bun run dev` (vite) | serves the app on :5173, proxies `/trpc` to the api |
| API | `cd server && bun run dev` | needs `DATABASE_URL` + `STRINGZ_PAY_URL` |
| stringz-pay (memory store) | `cd ../stringz-pay && bun run start` | serves on :8788 without `DATABASE_URL`; ephemeral |

## Scratch database

Use the local docker postgres (`sba-postgres`), never the shared dev db:

```sh
docker exec sba-postgres psql -U postgres -c "CREATE DATABASE paytest"
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/paytest
```

The api applies its own migrations on boot.

## Boot

```sh
# terminal 1: the rail (memory store - credits evaporate on restart)
cd stringz-pay && bun run start

# terminal 2: the api, pointed at the rail and the scratch db
cd server && env DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/paytest \
  STRINGZ_PAY_URL=http://127.0.0.1:8788 SERVER_PORT=8787 bun run dev

# terminal 3: the app
bun run dev
```

Sign up, connect a wallet, and run the checkout against the **Avalanche
test plan** (or temporarily lower `src/lib/pricing.ts` + stringz-pay
`src/config/plans.ts` together - they must match). Verify the flow in the
api logs: `[billing.verify] credited ...`.

## Fast headless check (no browser)

The wire check boots the api against a fixture rail and asserts the exact
JSON the browser receives for every outcome:

```sh
docker exec sba-postgres psql -U postgres -c "CREATE DATABASE wirecheck"
env DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/wirecheck \
  VERIFY_RETRY_ATTEMPTS=2 VERIFY_RETRY_INTERVAL_MS=50 \
  bun server/test/verify-wire-check.ts
```

It covers: credited shape, typed rejections, upstream-500 exceptional path,
and TX_NOT_FOUND absorbed into `pending`. If a payment bug appears in
production, the first question is now "does the wire check still pass?" -
not "send another 0.1 USDC".

## Rules

- Never point the local api at the production database or the production
  stringz-pay service.
- Never commit pricing changes made for local testing.
- If the wire check passes but production fails, the difference is in the
  rail's live state (chain, confirmations, price config) - read the
  `[billing.verify]` log line and stringz-pay's own logs before touching
  code.
