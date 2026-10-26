import { createOrdersApp } from '../services/orders/config/app';
import { createRestaurantsApp } from '../services/restaurants/config/app';
import { requestJson } from '../shared/http/client';
import { freePort } from '../tests/helpers/system';

const N = Number(process.env.BENCH_N ?? 300);
const WARMUP = 20;

interface Result {
  label: string;
  mean: number;
  p50: number;
  p95: number;
  max: number;
  hits: number;
  misses: number;
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** Вимірює час відповіді POST /orders (створення замовлення містить звернення до сервісу ресторанів). */
async function measure(label: string, simulatedLatencyMs: number, cacheTtlMs: number): Promise<Result> {
  const restaurantsPort = await freePort();
  const ordersPort = await freePort();
  const restaurants = await createRestaurantsApp({ port: restaurantsPort, simulatedLatencyMs });
  const orders = await createOrdersApp({
    port: ordersPort,
    restaurantsUrl: `http://127.0.0.1:${restaurantsPort}`,
    restaurantsTimeoutMs: 2000,
    restaurantCacheTtlMs: cacheTtlMs,
    subscribers: [],
  });
  await restaurants.start();
  await orders.start();
  const base = `http://127.0.0.1:${ordersPort}`;
  const create = async (id: string) => {
    const t = process.hrtime.bigint();
    const r = await requestJson(`${base}/orders`, {
      method: 'POST',
      timeoutMs: 5000,
      body: { id, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, Хрещатик, 10', items: ['Борщ'] },
    });
    if (r.status !== 201) throw new Error(`Очікувалось 201, отримано ${r.status}`);
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  try {
    for (let i = 0; i < WARMUP; i++) await create(`${label}-warm-${i}`);
    const before = (await requestJson(`${base}/internal/cache`, { timeoutMs: 1000 })).body;
    const times: number[] = [];
    for (let i = 0; i < N; i++) times.push(await create(`${label}-${i}`));
    const after = (await requestJson(`${base}/internal/cache`, { timeoutMs: 1000 })).body;
    const sorted = [...times].sort((a, b) => a - b);
    return {
      label,
      mean: times.reduce((a, b) => a + b, 0) / times.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
      hits: after.hits - before.hits,
      misses: after.misses - before.misses,
    };
  } finally {
    await orders.stop();
    await restaurants.stop();
  }
}

async function main() {
  console.log(`Сценарій: POST /orders (створення замовлення), ${N} послідовних запитів після ${WARMUP} прогрівальних.`);
  console.log('Сервіси — окремі HTTP-сервери на loopback, власні бази даних SQLite у пам’яті.\n');
  const cases: [string, number][] = [
    ['без додаткової затримки', 0],
    ['з імітацією затримки сервісу ресторанів 20 мс', 20],
  ];
  const rows: Result[] = [];
  for (const [name, latency] of cases) {
    console.log(`--- ${name} ---`);
    for (const [cacheLabel, ttl] of [['без кешу', 0], ['з кешем (TTL 30 с)', 30000]] as const) {
      const r = await measure(`${name}/${cacheLabel}`, latency, ttl);
      rows.push(r);
      const ratio = r.hits + r.misses ? Math.round((100 * r.hits) / (r.hits + r.misses)) : 0;
      console.log(
        `${cacheLabel.padEnd(20)} середній ${r.mean.toFixed(2)} мс | p50 ${r.p50.toFixed(2)} | p95 ${r.p95.toFixed(2)} | макс ${r.max.toFixed(2)} | влучань кешу ${ratio}% (${r.hits}/${r.hits + r.misses})`,
      );
    }
    console.log('');
  }
  console.log('JSON:', JSON.stringify(rows.map((r) => ({ ...r, mean: +r.mean.toFixed(2), p50: +r.p50.toFixed(2), p95: +r.p95.toFixed(2), max: +r.max.toFixed(2) }))));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
