#!/usr/bin/env node
/**
 * Regenerates app/demo/opengraph-image.png and twitter-image.png (1200x630)
 * from the real /demo hero. Run against a production server:
 *
 *   bun run build && bun run start -- -p 3100   # in another terminal
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *   CHROME=/usr/bin/google-chrome node scripts/generate-demo-og-image.mjs
 *
 * Not a project dependency on purpose: playwright-core and Chrome are only
 * needed when the hero (or the accent font, see PR_NOTES.md) changes.
 */
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.env.DEMO_URL ?? "http://localhost:3100/demo";

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  reducedMotion: "reduce",
});
await context.addInitScript(() => localStorage.setItem("latch-theme", "light"));
const page = await context.newPage();
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("#hero-create");

// Compose the card from the hero: TESTNET bar with the logo, copy, CTA and mascot.
await page.addStyleTag({
  content: `
    *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent; }
    main > :not(section:first-of-type), main ~ * { display: none !important; }
    button[aria-label="Dark mode"] { visibility: hidden !important; }
    section[aria-labelledby="hero-title"] > div:first-child { gap: 1rem !important; }
    section[aria-labelledby="hero-title"] { padding: 34px 0 0 !important; gap: 2rem !important; align-items: center !important; }
    section[aria-labelledby="hero-title"] h1 { font-size: 62px !important; }
    [class*="signInLine"], [class*="helper"] { display: none !important; }
    [class*="heroVisual"] > div[class*="card"] { display: none !important; }
    [class*="heroMascot"] { --mascot-scene-scale: 1.25 !important; margin-top: 10px; }
    [class*="heroDisc"] { width: 21rem !important; height: 21rem !important; top: 22px !important; }
  `,
});
await page.waitForTimeout(500);
await page.screenshot({ path: "app/demo/opengraph-image.png" });
copyFileSync("app/demo/opengraph-image.png", "app/demo/twitter-image.png");
await browser.close();
console.log("Wrote app/demo/opengraph-image.png and app/demo/twitter-image.png");
