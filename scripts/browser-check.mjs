import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const SHOTS = "tmp-verify/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);
};

const WHITELIST = [
  /projectId/i, // rainbowkit demo id warning is known/expected debt
  /walletconnect/i,
  /zod/i,
  /Cannot update a component \(`%s`\) while rendering a different component \(`%s`\)/, // upstream rainbowkit ConnectModal/wagmi Hydrate warning (PRD debt #10)
];

const browser = await chromium.launch();
let consoleErrors = [];

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() !== "error" || WHITELIST.some((re) => re.test(text))) return;
    // Bare "Failed to load resource" errors carry no URL - get it from the
    // response listener instead so walletconnect demo-id noise can be filtered.
    if (/^Failed to load resource/.test(text)) return;
    const loc = m.location();
    consoleErrors.push(`${text.slice(0, 400)} @ ${loc.url?.split("/").slice(0, 4).join("/") ?? ""}`);
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 200)));
  page.on("response", (res) => {
    if (res.status() >= 400 && !/walletconnect/i.test(res.url()) && !/web3modal/i.test(res.url())) {
      consoleErrors.push(`HTTP ${res.status()} ${res.url().slice(0, 120)}`);
    }
  });
  return { ctx, page };
}

const toastText = async (page, pattern, ms = 6000) => {
  try {
    await page.getByText(pattern).first().waitFor({ timeout: ms });
    return true;
  } catch {
    return false;
  }
};

// ── A. Landing ─────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const fontOk = await page.evaluate(async () => {
    await document.fonts.load('600 20px "Lexend Deca"');
    return document.fonts.check('600 20px "Lexend Deca"');
  });
  check("landing: Lexend Deca font loaded", fontOk);
  const heroFamily = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
  check("landing: hero uses Lexend Deca", /Lexend Deca/.test(heroFamily), heroFamily.slice(0, 60));
  await page.screenshot({ path: `${SHOTS}/01-landing-desktop.png`, fullPage: true });
  check("landing: no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  consoleErrors = [];
  await ctx.close();
}

// ── B. App canvas (desktop) ────────────────────────────────────────────────
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator('[aria-label="Connect from Price Feed"]').first().waitFor({ timeout: 15000 });
  check("canvas: initial nodes rendered", true);
  await page.screenshot({ path: `${SHOTS}/02-app-canvas.png` });

  // node card style locator (node name text uses text-[12.5px])
  const nodeName = (name) => page.locator(".text-\\[12\\.5px\\]", { hasText: name }).first();

  // 1. open Discord node sheet (default action "Post to channel"): webhook secret on open
  await nodeName("Discord").click();
  await page.getByText("Configuration", { exact: true }).waitFor();
  check("node sheet: opens with Configuration section", true);
  const webhookSecret = page.locator("input[placeholder='DISCORD_WEBHOOK_URL']");
  check("node sheet: discord webhook secret field (default action)", await webhookSecret.count() === 1);
  await page.screenshot({ path: `${SHOTS}/03-sheet-discord-webhook.png` });

  // 2. switch action -> "Get a message" swaps the secret default to the bot token
  await page.getByRole("button", { name: "Get a message", exact: true }).click();
  const botTokenSecret = page.locator("input[placeholder='DISCORD_BOT_TOKEN']");
  check("node sheet: bot-token secret default swaps per action", await botTokenSecret.count() === 1);
  await page.screenshot({ path: `${SHOTS}/04-sheet-discord-get.png` });

  // 3. switch back -> "Post to channel" reveals the Message textarea
  await page.getByRole("button", { name: "Post to channel", exact: true }).click();
  await page.locator("textarea").first().waitFor();
  check("node sheet: action switch reveals Message field", true);
  await page.locator("textarea").first().fill("Whale alert from browser test");
  await page.screenshot({ path: `${SHOTS}/05-sheet-discord-post.png` });

  // required marker + invalid pattern demo: close, reopen stays? close via backdrop
  await page.locator(".z-50.bg-black\\/25").click({ position: { x: 20, y: 20 } });

  // 3. add Telegram from tools panel
  await page.getByRole("button", { name: /Telegram/ }).click();
  await nodeName("Telegram").waitFor();
  check("panel: Telegram added to canvas", true);

  // 4. connect Price Feed -> Telegram by dragging the + port
  const src = await page.locator('[aria-label="Connect from Price Feed"]').first().boundingBox();
  const dst = await page.locator(".absolute.z-10.cursor-grab", { hasText: "Telegram" }).first().boundingBox();
  if (src && dst) {
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 12 });
    await page.mouse.up();
    check("canvas: drag-connect produces edge", await toastText(page, /connected/i));
  } else {
    check("canvas: drag-connect produces edge", false, "port or node not found");
  }
  await page.screenshot({ path: `${SHOTS}/06-canvas-telegram-connected.png` });

  // 5. export gate: Telegram missing required chatId -> MISSING_PARAMS toast.
  // Open the sheet to screenshot the empty required fields, then close it:
  // the sheet backdrop covers the toolbar, so export is only reachable with the sheet closed.
  await nodeName("Telegram").click();
  await page.getByText("Configuration", { exact: true }).waitFor();
  await page.screenshot({ path: `${SHOTS}/07-export-blocked.png` });
  await page.locator(".z-50.bg-black\\/25").click({ position: { x: 20, y: 20 } });
  await page.getByLabel("Export").click();
  check("export: blocked with MISSING_PARAMS", await toastText(page, /Missing or invalid configuration/));

  // 6. configure every remaining required field on the canvas, then export compiles.
  // The MISSING_PARAMS gate is doing its job: price-feed/slack/telegram all
  // ship with empty required fields by default.
  const fillNode = async (name, fills) => {
    await nodeName(name).click();
    await page.getByText("Configuration", { exact: true }).waitFor();
    for (const [placeholder, value] of fills) {
      await page.locator(`input[placeholder='${placeholder}'], textarea[placeholder='${placeholder}']`).first().fill(value);
    }
    await page.locator(".z-50.bg-black\\/25").click({ position: { x: 20, y: 20 } });
  };
  await fillNode("Price Feed", [["3000", "3000"]]);
  await fillNode("Slack", [["#alerts", "#alerts"]]);
  await page.locator(".absolute.z-10.cursor-grab", { hasText: "Slack" }).first().click();
  await page.getByText("Configuration", { exact: true }).waitFor();
  await page.locator("textarea").first().fill("price alert");
  await page.locator(".z-50.bg-black\\/25").click({ position: { x: 20, y: 20 } });
  await fillNode("Telegram", [["-1001234567890 or @mychannel", "@flowkit_test"]]);
  await page.locator(".absolute.z-10.cursor-grab", { hasText: "Telegram" }).first().click();
  await page.locator("textarea").first().fill("hello from browser test");
  await page.locator(".z-50.bg-black\\/25").click({ position: { x: 20, y: 20 } });

  await page.getByLabel("Export").click();
  await page.waitForTimeout(300);
  {
    const actual = await page.locator(".z-\\[70\\]").innerText().catch(() => "(no toast)");
    // Toolbar Export downloads the Blueprint JSON; the CRE zip export lives in the Deploy sheet (same compileFlow).
    check("export: compiles after fields filled", /compiled/.test(actual), `toast was: ${actual.slice(0, 220)}`);
  }
  await page.screenshot({ path: `${SHOTS}/08-export-ok.png` });
  check("canvas: no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  consoleErrors = [];
  await ctx.close();
}

// ── C. Auth + save/load round-trip ─────────────────────────────────────────
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  const email = `browser-test-${Date.now()}@example.com`;
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  if ((await page.locator("input[placeholder='Your name']").count()) === 0) {
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
  }
  await page.locator("input[placeholder='Your name']").fill("Browser Test");
  await page.locator("input[placeholder='Enter your email']").fill(email);
  await page.locator("input[type='password']").fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  // wait for the actual navigation to /app (the regex /app|auth/ would match the current /auth instantly)
  const navigated = await page.waitForURL("**/app", { timeout: 15000 }).then(() => true).catch(() => false);
  check("auth: email signup", navigated, page.url());

  // Fresh signups get the 3-question onboarding before the builder (Typeform-style steps).
  await page.getByText("What's your role?", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "A friend", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No thanks", exact: true }).click();
  await page.getByRole("button", { name: "Start building", exact: true }).click();
  await page.waitForURL("**/app", { timeout: 15000 });
  check("auth: onboarding completes", true);

  // a completed user is not bounced back to /onboarding
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator('[aria-label="Connect from Price Feed"]').first().waitFor({ timeout: 15000 });
  await page.getByLabel("Save").click();
  check("flows: save", await toastText(page, /Scenario saved/));

  await page.getByLabel("Flows").click();
  await page.getByText("My flows", { exact: true }).waitFor();
  await page.screenshot({ path: `${SHOTS}/09-my-flows.png` });
  check("flows: saved flow listed", await toastText(page, /Untitled scenario/, 8000));
  await page.getByRole("button", { name: "Load", exact: true }).first().click();
  check("flows: load", await toastText(page, /Loaded/));
  check("auth+flows: no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  consoleErrors = [];
  await ctx.close();
}

// ── D. Mobile viewports ────────────────────────────────────────────────────
for (const [w, h, label] of [[390, 844, "phone"]]) {
  const { ctx, page } = await newPage({ width: w, height: h });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SHOTS}/10-landing-${label}.png`, fullPage: true });
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  // On phone viewports the builder shows a "not designed for small screens" gate;
  // assert it, then continue into the canvas so the console-error check still runs.
  const gate = page.getByText(/designed for small screens/i);
  await gate.waitFor({ timeout: 15000 });
  check(`mobile (${label}): small-screen gate shown`, await gate.isVisible());
  await page.getByRole("button", { name: "Continue anyway" }).click();
  await page.locator('[aria-label="Connect from Price Feed"]').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/11-app-${label}.png` });
  check(`mobile (${label}): no console errors`, consoleErrors.length === 0, consoleErrors.join(" | "));
  consoleErrors = [];
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
