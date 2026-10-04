# Who it helps

## Web3 developers

You can write a CRE workflow by hand - the SDK is solid. Stringz is for
everything around it: prototyping in minutes instead of hours, the boring
glue (alerts, feeds, sheets), and handing flows to teammates who do not write
TypeScript. Export the code and it is a normal CRE project, so nothing about
your final deployment changes.

## Founders and operators

Treasury balances to watch, positions to monitor, community channels to keep
alive. If you can describe the automation in a sentence - "when ETH drops
below $2,600, ping Discord" - you can build it on the canvas, simulate it
for real, and deploy it without writing code or giving anyone custody of your
keys.

## Chainlink and CRE users

Every Stringz flow is a CRE workflow. The canvas is a frontend to CRE
triggers, consensus, and chain writes - which means anything you build here
runs on the same runtime and tooling you already know.

## Honest limits

- **Some nodes need your own keys.** Discord, Telegram, AI providers, and
  similar services work with the credentials you bring.
- **Simulation runs on your machine.** You need the CRE CLI and RPC URLs for
  the chains you touch. Deploying additionally requires CRE deploy access,
  which you request from Chainlink.
- **No managed custody, by design.** If you want a fully done-for-you hosted
  runner, Stringz is not that - and will not be.

## Where to next

- [What is Stringz](/docs/what-is-stringz)
- [How it works](/docs/how-it-works)
- [Open the builder](https://flowkit-api-302711461286.us-central1.run.app/app)
