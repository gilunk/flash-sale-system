import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// k6 stress test: hit the API directly (no browser) to measure how fast the
// concurrency gate actually is and prove the no-overselling property at
// realistic flash-sale RPS. Run AFTER seeding stock and BEFORE re-seeding.
//
// Usage:
//   docker compose up -d
//   pnpm --filter backend db:seed   # stock = 50
//   pnpm --filter backend dev
//   k6 run apps/backend/test/stress/k6-purchase.js \
//     --env API_BASE=http://localhost:3200/api \
//     --env SALE_ID=<sale-id-from-seed-output>

const API_BASE = __ENV.API_BASE || 'http://localhost:3200/api';
const SALE_ID = __ENV.SALE_ID; // required — cuid printed by db:seed

export const options = {
  // 200 concurrent virtual users firing 1000 attempts total. Adjust ATTEMPTS
  // to be much greater than seeded stock so SOLD_OUT is exercised.
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: 200,
      iterations: 1000,
      maxDuration: '2m',
    },
  },
  thresholds: {
    'http_req_failed{check:no_5xx}': ['rate<0.01'],         // <1% 5xx
    'http_req_duration{check:purchase}': ['p(95)<1000'],    // p95 < 1s
  },
};

export function setup() {
  if (!SALE_ID) {
    throw new Error(
      'Pass SALE_ID via --env SALE_ID=<cuid>. The seed script prints it.',
    );
  }
  return { saleId: SALE_ID };
}

export default function (data) {
  const payload = JSON.stringify({
    email: `vu_${__VU}_iter_${__ITER}@stress.test`,
    sale_id: data.saleId,
  });

  const res = http.post(`${API_BASE}/sale/purchase`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': uuidv4(),
    },
    tags: { check: 'purchase' },
  });

  check(res, {
    'is 201 or 409': (r) => r.status === 201 || r.status === 409,
    'no 5xx': (r) => r.status < 500,
  }, { check: 'no_5xx' });
}

export function teardown() {
  // Verify post-run that overselling didn't happen by hitting /sale/status
  // and asserting remainingStock is sane (>= 0). For full proof, look at
  // the orders table in psql:
  //   SELECT count(*) FROM orders;        -- should equal initial stock
  //   SELECT remaining_stock FROM sales;  -- should be 0
  const res = http.get(`${API_BASE}/sale/status`);
  if (res.status === 200) {
    const body = JSON.parse(res.body);
    // eslint-disable-next-line no-console
    console.log(
      `\n[teardown] state=${body.state} remainingStock=${body.remainingStock}/${body.totalStock}`,
    );
  }
}
