import { chromium, expect, test, type Browser } from '@playwright/test';

// Tunables. STOCK / ATTEMPTS default to laptop-sustainable values; bump them
// via env when running on a beefier machine (e.g. STRESS_STOCK=50
// STRESS_ATTEMPTS=80). 30 simultaneous Chromium contexts is the sweet spot
// for a typical 8-core laptop — 80+ tends to thrash the Next.js dev server.
const STOCK = Number(process.env.STRESS_STOCK ?? 10);
const ATTEMPTS = Number(process.env.STRESS_ATTEMPTS ?? 30);

// Run contexts in waves rather than a single Promise.all. Firing all N
// browser pages at once overwhelms the Next.js dev compiler under load —
// staggering them keeps both the dev server and the OS happy.
const WAVE_SIZE = Number(process.env.STRESS_WAVE_SIZE ?? 5);

// Suffix every email with a per-run timestamp so prior orders attached to
// the same sale_id don't make us hit ALREADY_PURCHASED. Without this, the
// same email "loadtest0@example.com" wins once, then every subsequent run
// rejects it because the unique(user_id, sale_id) catches it.
const RUN_ID = Date.now();

const API_BASE = process.env.STRESS_API_BASE ?? 'http://localhost:3200/api';
const COMMAND_SECRET = process.env.COMMAND_SECRET ?? 'command-secret';

// Reset the sale to a known stock via the backend's admin command. Without
// this the test would assert against whatever stock happens to be left over
// from prior runs — non-deterministic and confusing.
async function resetSale(stock: number): Promise<void> {
  const res = await fetch(`${API_BASE}/command/insert-sale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-command-secret': COMMAND_SECRET,
    },
    body: JSON.stringify({ qty: stock }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to reset sale: ${res.status} ${body}`);
  }
}

test('no-oversell under concurrent UI purchases', async () => {
  // Step 1: ensure a fresh sale with exactly STOCK items available.
  await resetSale(STOCK);

  const browser: Browser = await chromium.launch();

  // Each "user" gets their own context — isolated localStorage, cookies,
  // socket connection. This is the closest Playwright gets to N concurrent
  // real users on the page. 80 contexts is heavy but sustainable on a
  // laptop; 150+ tends to thrash the OS and Chromium pool.
  const contexts = await Promise.all(
    Array.from({ length: ATTEMPTS }, () => browser.newContext()),
  );

  // Track sample errors so we can debug failures without spamming the log.
  const errorSamples: string[] = [];

  type Outcome = 'success' | 'sold_out' | 'already_purchased' | 'error';

  async function runOne(ctx: (typeof contexts)[number], i: number): Promise<Outcome> {
    const page = await ctx.newPage();
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Race: page may render with an enabled input (ACTIVE sale) OR with
      // the SOLD_OUT state already (input disabled, banner visible). When
      // a wave lands after stock is drained, the latter is correct — count
      // it as sold_out without trying to .fill() a disabled input.
      const pageState = await Promise.race<'interactive' | 'sold_out_landing'>([
        page
          .waitForSelector('input[type=email]:not([disabled])', { timeout: 60_000 })
          .then(() => 'interactive'),
        page
          .waitForSelector('text=Sold out', { timeout: 60_000 })
          .then(() => 'sold_out_landing'),
      ]);

      if (pageState === 'sold_out_landing') {
        return 'sold_out';
      }

      await page.fill('input[type=email]', `loadtest-${RUN_ID}-${i}@example.com`);
      await page.click('button[type=submit]');

      // Race the four possible post-click outcome banners.
      return await Promise.race<Outcome>([
        page
          .waitForSelector('text=Purchase confirmed', { timeout: 60_000 })
          .then(() => 'success'),
        page
          .waitForSelector('text=Sold out', { timeout: 60_000 })
          .then(() => 'sold_out'),
        page
          .waitForSelector('text=already purchased', { timeout: 60_000 })
          .then(() => 'already_purchased'),
        page
          .waitForSelector('text=Something went wrong', { timeout: 60_000 })
          .then(() => 'error'),
      ]);
    } catch (err) {
      // Surface the first few error messages so failures are debuggable.
      if (errorSamples.length < 3) {
        errorSamples.push(err instanceof Error ? err.message : String(err));
      }
      return 'error';
    } finally {
      await ctx.close();
    }
  }

  const start = Date.now();
  // Wave loop: launch WAVE_SIZE pages in parallel, wait, then next wave.
  // Concurrency is preserved within a wave (still proves no-overselling at
  // up to WAVE_SIZE simultaneous purchases) without blowing up the dev server.
  const results: Outcome[] = [];
  for (let waveStart = 0; waveStart < contexts.length; waveStart += WAVE_SIZE) {
    const wave = contexts
      .slice(waveStart, waveStart + WAVE_SIZE)
      .map((ctx, offset) => runOne(ctx, waveStart + offset));
    results.push(...(await Promise.all(wave)));
  }
  const elapsedMs = Date.now() - start;

  const summary = results.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }),
    {},
  );

  // Print a clean summary so the take-home README can copy it verbatim.
  // eslint-disable-next-line no-console
  console.log('\n=== STRESS TEST RESULTS ===');
  // eslint-disable-next-line no-console
  console.log(`stock=${STOCK}, attempts=${ATTEMPTS}, elapsed=${elapsedMs}ms`);
  // eslint-disable-next-line no-console
  console.log('outcomes:', summary);
  if (errorSamples.length > 0) {
    // eslint-disable-next-line no-console
    console.log('first error samples:', errorSamples);
  }
  // eslint-disable-next-line no-console
  console.log('===========================\n');

  await browser.close();

  // Headline assertion: no overselling.
  expect(summary.success ?? 0).toBeLessThanOrEqual(STOCK);
  // Stricter: with a fresh seed of stock=STOCK, every slot should be claimed.
  expect(summary.success ?? 0).toBe(STOCK);
  // No real errors — failures should be business rejections (sold_out), not crashes.
  expect(summary.error ?? 0).toBe(0);
  // Sanity: every attempt got an answer.
  const total =
    (summary.success ?? 0) + (summary.sold_out ?? 0) + (summary.already_purchased ?? 0);
  expect(total).toBe(ATTEMPTS);
});
