import { chromium, expect, test, type Browser } from '@playwright/test';

// Tunables. Keep STOCK in sync with what your seed creates so the assertions
// are meaningful. ATTEMPTS should comfortably exceed STOCK so the SOLD_OUT
// branch is exercised.
const STOCK = Number(process.env.STRESS_STOCK ?? 50);
const ATTEMPTS = Number(process.env.STRESS_ATTEMPTS ?? 150);

test('no-oversell under concurrent UI purchases', async () => {
  const browser: Browser = await chromium.launch();

  // Each "user" gets their own context — isolated localStorage, cookies,
  // socket connection. This is the closest Playwright gets to N concurrent
  // real users on the page.
  const contexts = await Promise.all(
    Array.from({ length: ATTEMPTS }, () => browser.newContext()),
  );

  const start = Date.now();
  const results = await Promise.all(
    contexts.map(async (ctx, i) => {
      const page = await ctx.newPage();
      try {
        await page.goto('/');
        await page.waitForSelector('input[type=email]', { timeout: 15_000 });

        await page.fill('input[type=email]', `loadtest${i}@example.com`);
        await page.click('button[type=submit]');

        // Race the four possible outcome banners. Whichever appears first wins.
        const outcome = await Promise.race([
          page
            .waitForSelector('text=Purchase confirmed', { timeout: 60_000 })
            .then(() => 'success' as const),
          page
            .waitForSelector('text=Sold out', { timeout: 60_000 })
            .then(() => 'sold_out' as const),
          page
            .waitForSelector('text=already purchased', { timeout: 60_000 })
            .then(() => 'already_purchased' as const),
          page
            .waitForSelector('text=Something went wrong', { timeout: 60_000 })
            .then(() => 'error' as const),
        ]);
        return outcome;
      } catch (err) {
        // Timeout / page crashed / network blew up — count as error.
        return 'error' as const;
      } finally {
        await ctx.close();
      }
    }),
  );
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
  // eslint-disable-next-line no-console
  console.log('===========================\n');

  // Headline assertion: no overselling.
  expect(summary.success ?? 0).toBeLessThanOrEqual(STOCK);
  // Stricter: with a fresh seed of stock=STOCK, every slot should be claimed.
  expect(summary.success ?? 0).toBe(STOCK);
  // No real errors — failures should be business rejections (sold_out), not crashes.
  expect(summary.error ?? 0).toBe(0);
  // Sanity: every attempt got an answer.
  const total = (summary.success ?? 0) + (summary.sold_out ?? 0) + (summary.already_purchased ?? 0);
  expect(total).toBe(ATTEMPTS);

  await browser.close();
});
