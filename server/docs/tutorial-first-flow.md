# Build your first flow: ETH dip alert to Discord

This walkthrough builds the exact flow featured in our demo video: when the
Chainlink ETH/USD feed drops below $2,800, post a formatted alert to a
Discord channel. It takes about five minutes on a free Community account.

You will touch every part of the loop: triggers, templates that pass data
between nodes, a dry run on live data, a real cloud simulation, and the
export that turns the canvas into a Chainlink CRE project.

## What you need

- A Stringz account. Community tier is fine - this flow costs one cloud
  simulation credit, and you get 50 per month.
- A Discord webhook URL. In Discord: channel settings, Integrations,
  Webhooks, New Webhook, Copy Webhook URL. For the dry runs you can use any
  placeholder URL - only the cloud run and the local CRE run actually call
  it.
- About five minutes.

## 1. Start a new scenario

From your dashboard, hit **New scenario**. You get a blank canvas with the
tools panel on the right, grouped by category: Flow Control, Triggers, Web3,
Messaging, and more. (On a fresh account the canvas opens with a starter
demo instead - the same **New scenario** button clears it.)

![The blank canvas with the tools panel on the right](/docs/assets/step-tools.webp)

## 2. Add three nodes

In the tools panel, click **Price Feed** (under Web3), **Text Parser**
(under Flow Control), then **Discord** (under Messaging). Each click drops a
node onto the canvas. You can also press Cmd/Ctrl+K and type the name -
the palette finds every module and action.

![Three unconnected nodes on the canvas](/docs/assets/step-add-nodes.webp)

## 3. Configure the Price Feed trigger

Click the Price Feed node to open its sheet.

- Action: **Price below**.
- Chain: **Ethereum** (already selected).
- Pair: **ETH/USD** (already selected). The sheet shows the live feed price
  so you can sanity-check your threshold.
- Threshold (USD): **2800**.

![Price Feed sheet with Price below selected and a live ETH/USD price](/docs/assets/step-price-feed.webp)

Close the sheet (click outside it or press Escape).

## 4. Write the message with the Text Parser

Click the Text Parser node. **Replace text** is already the selected action.
Fill the three fields:

- Text: `ETH dipped to $PRICE - below your $2,800 line.`
- Find: `PRICE`
- Replace with: `{{price-feed-1.price}}`

The `{{...}}` token is how data moves between nodes: `nodeId.field`. The
field takes the token from the expression picker, which lists every upstream
node's run-data fields; typing `{{` in any template field opens the same
list. Your exact node id may differ from the screenshot - always insert from
the picker rather than typing the id by hand.

![Text Parser sheet: Replace text with a {{price-feed-1.price}} token in Replace with](/docs/assets/step-text-parser.webp)

What you have now: the parser takes the sentence, finds the placeholder
`PRICE`, and replaces it with the live price the feed node produced.

## 5. Point Discord at your webhook

Click the Discord node and pick the **Post to channel** action.

- Discord credential: `DISCORD_WEBHOOK_URL` is already filled in. This is
  the NAME of an environment variable, not the secret itself. Stringz stores
  secret names only, never values - the value lives in your `.env` (local
  CRE runs) or gets pasted per cloud run (next step).
- Message: `{{text-parser-2.result}}` - again, insert it from the picker so
  the node id matches your canvas.

![Discord sheet: Post to channel with a {{text-parser-2.result}} message token](/docs/assets/step-discord.webp)

## 6. Connect the nodes

Drag from the small **+** on the right edge of the Price Feed node onto the
Text Parser node, then from Text Parser's **+** onto Discord. Each drop
draws the line and locks the data flow: feed, then parser, then Discord.

![The three nodes connected in a left-to-right chain](/docs/assets/step-connected.webp)

## 7. Run it - dry run on live data

Press the dark **play** button (bottom left). This is the design-time run:
the Price Feed node reads the live Chainlink feed, the Text Parser computes
your sentence with the real number, and nothing is sent anywhere.

Two things to look at:

- Click the Text Parser node and scroll to **Run data**: the Output tab
  shows the actual computed message, for example
  `ETH dipped to $2650.42 - below your $2,800 line.` The `computed` badge
  means this came from the real run, not a sample shape.

  ![Text Parser run data showing the formatted message with a live price](/docs/assets/step-run-data.webp)

- The Discord node turns red. That is intentional, not a bug: the browser
  run has no webhook VALUE (Stringz never holds key values), so the step
  reports exactly what is missing.

  ![Discord node run data showing the honest missing-secret error](/docs/assets/step-discord-error.webp)

## 8. Test in cloud - the real CRE path

Press the **cloud** button (next to play). Because this flow reads a secret
at run time, a preflight panel asks for `DISCORD_WEBHOOK_URL`. Paste your
real webhook URL (or any URL that returns 200, such as an httpbin testing
endpoint, if you just want to see the run). The value goes into an isolated
run sandbox and is destroyed when the run ends - it is never stored.

Hit **Start cloud run**. Stringz compiles your canvas to WASM and runs it on
the real Chainlink CRE path on our infrastructure. The runner log streams
live: you will see the same `replace -> ETH dipped to $2698.29 - below your
$2,800 line.` line, this time produced by the compiled workflow, and the
Discord step POSTs your message for real. A Community credit is used; the
run lands on your Statistics page.

![Cloud run sheet with the runner log and node outputs](/docs/assets/step-cloud.webp)

![A successful cloud run result](/docs/assets/step-cloud-success.webp)

## 9. Export it - the project is yours

Press the **rocket** (Deploy) to open the deploy sheet. Option 1 exports the
CRE project: a zip with `main.ts`, `project.yaml`, `secrets.yaml`, and a
README with the exact commands. The sheet shows the three-command local run:
copy `.env.example` to `.env` and add your webhook, install, then
`cre workflow simulate`. Option 3 is the DON: deployment to a Chainlink DON
runs under your own CRE account - request access once with
`cre account access` and Chainlink replies by email.

![Deploy sheet with the local-run commands and export buttons](/docs/assets/step-export.webp)

That is the whole loop: canvas, live dry run, real cloud simulation, and a
portable CRE project under your own keys.

## Where to next

- [How it works](/docs/how-it-works) - what happens under the canvas
- [Who it helps](/docs/who-it-helps) - more flows to steal
- [Open the builder](https://flowkit-api-302711461286.us-central1.run.app/app)
