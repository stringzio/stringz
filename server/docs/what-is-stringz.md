# What is Stringz?

Stringz is a visual, open-source builder for Web3 automations - "n8n for
Web3". Instead of writing workflow code by hand, you drag nodes onto a canvas:
Chainlink price feeds, EVM event listeners, contract calls, swaps, and CCIP,
mixed with the web2 tools you already use - Slack, Discord, Telegram, Google
Sheets, Notion, and more.

The canvas compiles into a real [Chainlink CRE](https://docs.chain.link/cre)
workflow project: TypeScript you can read, simulate locally, and deploy under
your own CRE account. You are never locked into a black box - the generated
code is the product.

## What Stringz is not

- **Not a custodian.** Stringz never holds your keys, funds, or signatures.
  Secrets you configure on nodes go into the exported project, under your
  control.
- **Not a hosted runner.** Workflows run under your Chainlink CRE account,
  with your own secrets and RPC endpoints. Stringz is the factory, not the
  factory floor.
- **Not a token platform.** No token, no chain of our own. Just tooling on top
  of Chainlink CRE.

## Open source, self-hostable

The [source is on GitHub](https://github.com/stringzio/stringz) under
Apache-2.0. You can self-host the whole app, or use the hosted version and pay
for Pro with USDC on-chain. Either way, the workflows you export are yours.

## Where to next

- [How it works](/docs/how-it-works) - from canvas to CRE workflow
- [Who it helps](/docs/who-it-helps) - developers, founders, communities
- [Open the builder](https://flowkit-api-302711461286.us-central1.run.app/app)
