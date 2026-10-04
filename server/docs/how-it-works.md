# How it works

Stringz turns a canvas drawing into a runnable Chainlink CRE workflow in four
steps.

## 1. Draw the flow

Each node does one thing: a trigger (cron schedule, price feed, on-chain
event), a transform (filter, condition, text parser), or an action (send a
Discord message, call a contract, write a row to Google Sheets). Connect nodes
with edges and data flows from one to the next - the output of the previous
node is available to the one that follows.

## 2. Compile

Hit **Export** and Stringz compiles the canvas into a CRE workflow project:
`main.ts`, `project.yaml`, `secrets.yaml`, and a README with the exact
commands to run it. The code is plain TypeScript built on the
[CRE SDK](https://docs.chain.link/cre) - readable, diffable, yours.

## 3. Simulate

Run `cre workflow simulate <project> --target staging-settings` against the
exported project. Simulation uses your RPC URLs and your secrets, so the price
feeds are real and the Discord webhook really fires. This is the honest test:
what you see in simulation is what runs on CRE.

## 4. Deploy

Deployment goes through your own Chainlink CRE account. Request access with
`cre account access`, then deploy the same project you simulated. Stringz is
not in that loop - no proxying, no shared keys.

## Where your secrets live

API keys and webhook URLs you enter on nodes are written into the exported
project's `secrets.yaml` (or `.env`), which never leaves your machine unless
you move it. The hosted app stores them so your flows are reproducible, and
deleting a flow deletes them. The [tooling-only
stance](/docs/what-is-stringz#what-stringz-is-not) applies end to end.

## Where to next

- [Who it helps](/docs/who-it-helps)
- [Open the builder](https://flowkit-api-302711461286.us-central1.run.app/app)
