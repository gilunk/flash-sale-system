# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: no-oversell.spec.ts >> no-oversell under concurrent UI purchases
- Location: tests/stress/no-oversell.spec.ts:9:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 50
Received: 0
```

# Test source

```ts
  1  | import { chromium, expect, test, type Browser } from '@playwright/test';
  2  | 
  3  | // Tunables. Keep STOCK in sync with what your seed creates so the assertions
  4  | // are meaningful. ATTEMPTS should comfortably exceed STOCK so the SOLD_OUT
  5  | // branch is exercised.
  6  | const STOCK = Number(process.env.STRESS_STOCK ?? 50);
  7  | const ATTEMPTS = Number(process.env.STRESS_ATTEMPTS ?? 150);
  8  | 
  9  | test('no-oversell under concurrent UI purchases', async () => {
  10 |   const browser: Browser = await chromium.launch();
  11 | 
  12 |   // Each "user" gets their own context — isolated localStorage, cookies,
  13 |   // socket connection. This is the closest Playwright gets to N concurrent
  14 |   // real users on the page.
  15 |   const contexts = await Promise.all(
  16 |     Array.from({ length: ATTEMPTS }, () => browser.newContext()),
  17 |   );
  18 | 
  19 |   const start = Date.now();
  20 |   const results = await Promise.all(
  21 |     contexts.map(async (ctx, i) => {
  22 |       const page = await ctx.newPage();
  23 |       try {
  24 |         await page.goto('/');
  25 |         await page.waitForSelector('input[type=email]', { timeout: 15_000 });
  26 | 
  27 |         await page.fill('input[type=email]', `loadtest${i}@example.com`);
  28 |         await page.click('button[type=submit]');
  29 | 
  30 |         // Race the four possible outcome banners. Whichever appears first wins.
  31 |         const outcome = await Promise.race([
  32 |           page
  33 |             .waitForSelector('text=Purchase confirmed', { timeout: 60_000 })
  34 |             .then(() => 'success' as const),
  35 |           page
  36 |             .waitForSelector('text=Sold out', { timeout: 60_000 })
  37 |             .then(() => 'sold_out' as const),
  38 |           page
  39 |             .waitForSelector('text=already purchased', { timeout: 60_000 })
  40 |             .then(() => 'already_purchased' as const),
  41 |           page
  42 |             .waitForSelector('text=Something went wrong', { timeout: 60_000 })
  43 |             .then(() => 'error' as const),
  44 |         ]);
  45 |         return outcome;
  46 |       } catch (err) {
  47 |         // Timeout / page crashed / network blew up — count as error.
  48 |         return 'error' as const;
  49 |       } finally {
  50 |         await ctx.close();
  51 |       }
  52 |     }),
  53 |   );
  54 |   const elapsedMs = Date.now() - start;
  55 | 
  56 |   const summary = results.reduce<Record<string, number>>(
  57 |     (acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }),
  58 |     {},
  59 |   );
  60 | 
  61 |   // Print a clean summary so the take-home README can copy it verbatim.
  62 |   // eslint-disable-next-line no-console
  63 |   console.log('\n=== STRESS TEST RESULTS ===');
  64 |   // eslint-disable-next-line no-console
  65 |   console.log(`stock=${STOCK}, attempts=${ATTEMPTS}, elapsed=${elapsedMs}ms`);
  66 |   // eslint-disable-next-line no-console
  67 |   console.log('outcomes:', summary);
  68 |   // eslint-disable-next-line no-console
  69 |   console.log('===========================\n');
  70 | 
  71 |   // Headline assertion: no overselling.
  72 |   expect(summary.success ?? 0).toBeLessThanOrEqual(STOCK);
  73 |   // Stricter: with a fresh seed of stock=STOCK, every slot should be claimed.
> 74 |   expect(summary.success ?? 0).toBe(STOCK);
     |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  75 |   // No real errors — failures should be business rejections (sold_out), not crashes.
  76 |   expect(summary.error ?? 0).toBe(0);
  77 |   // Sanity: every attempt got an answer.
  78 |   const total = (summary.success ?? 0) + (summary.sold_out ?? 0) + (summary.already_purchased ?? 0);
  79 |   expect(total).toBe(ATTEMPTS);
  80 | 
  81 |   await browser.close();
  82 | });
  83 | 
```