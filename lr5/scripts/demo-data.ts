import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { requestJson } from '../shared/http/client';
import { ManagedService, portsFrom, ServiceName } from './processes';

const base = Number(process.env.BASE_PORT ?? 3000);
const ports = portsFrom(base);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-data-'));
const names: ServiceName[] = ['restaurants', 'delivery', 'orders', 'gateway'];
const svc = Object.fromEntries(
  names.map((n) => [n, new ManagedService(n, ports, (name, line) => {
    if (/outbox:/.test(line)) console.log(`      · [${name}] ${line.replace(/^\[\w+\]\s*/, '')}`);
  }, dataDir)]),
) as Record<ServiceName, ManagedService>;

const gw = `http://127.0.0.1:${ports.gateway}`;
const api = (p: string, method = 'GET', body?: unknown) => requestJson(`${gw}${p}`, { method, body, timeoutMs: 6000 });
const direct = (name: ServiceName, p: string, method = 'GET', body?: unknown) => requestJson(`${svc[name].url}${p}`, { method, body, timeoutMs: 4000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (text: string) => console.log(text);
const order = (id: string) => ({ id, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, вул. Хрещатик, 10', items: ['Борщ', 'Вареники'] });
const show = (label: string, status: number, body: any) => {
  const d = body?.error ? body.error.code : body?.status ?? (Array.isArray(body) ? `${body.length} шт.` : '');
  say(`   ${label} → ${status}${d ? ` ${d}` : ''}`);
};
const cache = async () => (await direct('orders', '/internal/cache')).body;
const envelope = (eventId: string, orderId: string) => ({
  eventId, type: 'order.confirmed', version: 1, occurredAt: new Date().toISOString(), producer: 'orders',
  data: { orderId, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, вул. Хрещатик, 10', items: ['Борщ'] },
});
async function until<T>(fn: () => Promise<T | false>, timeoutMs = 20000) {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    const v = await fn();
    if (v) return { value: v, ms: Date.now() - t };
    await sleep(80);
  }
  throw new Error('Очікуваний стан не настав');
}

async function main() {
  say('=== Запуск чотирьох процесів; кожен сервіс відкриває власну базу даних ===');
  names.forEach((n) => svc[n].start());
  await Promise.all(names.map((n) => svc[n].waitHealthy()));
  say(`   каталог баз даних: ${dataDir}`);
  say(`   файли: ${fs.readdirSync(dataDir).filter((f) => f.endsWith('.db')).sort().join(', ')}`);

  say('\n=== 1. Кешування: інформація про ресторан у сервісі замовлень (TTL 30 с, ключ — restaurantId) ===');
  for (const id of ['order-1', 'order-2', 'order-3', 'order-4']) {
    const r = await api('/api/orders', 'POST', order(id));
    show(`POST /api/orders (${id})`, r.status, r.body);
  }
  say(`   статистика кешу: ${JSON.stringify(await cache())}  ← 1 промах (звернення до сервісу), 3 влучання`);
  say('   Ресторан призупиняє приймання; сервіс ресторанів публікує подію restaurant.availability-changed...');
  show('POST /api/restaurants/rest-1/pause', (await api('/api/restaurants/rest-1/pause', 'POST')).status, undefined);
  const rejected = await until(async () => {
    const r = await api('/api/orders', 'POST', order(`probe-${Date.now()}`));
    return r.status === 422 ? r : false;
  });
  show('POST /api/orders після призупинення', rejected.value.status, rejected.value.body);
  say(`     кеш інвалідовано подією: нові замовлення відхилено через ${rejected.ms} мс (а не через 30 с TTL).`);
  say(`   статистика кешу: ${JSON.stringify(await cache())}`);
  await api('/api/restaurants/rest-1/resume', 'POST');
  await until(async () => (await api('/api/orders', 'POST', order(`resume-${Date.now()}`))).status === 201 && true);
  say('   ресторан відновив приймання, замовлення знову створюються.');

  say('\n=== 2. Узгодженість через подію order.confirmed з ідемпотентним обробником ===');
  show('POST /api/orders/order-1/confirm', (await api('/api/orders/order-1/confirm', 'POST')).status, (await api('/api/orders/order-1')).body);
  const q = await until(async () => {
    const w = await api('/api/deliveries/waiting');
    return w.status === 200 && w.body.length === 1 ? w.body : false;
  });
  say(`   подію оброблено сервісом доставки (черга диспетчера: ${q.value.length} замовлення, через ${q.ms} мс)`);
  say('   Надсилаємо ту саму подію (eventId evt-dup) двічі безпосередньо споживачу:');
  const first = await direct('delivery', '/internal/events', 'POST', envelope('evt-dup', 'order-77'));
  const second = await direct('delivery', '/internal/events', 'POST', envelope('evt-dup', 'order-77'));
  say(`   1-ше надсилання → ${first.status} ${first.body.status}`);
  say(`   2-ге надсилання → ${second.status} ${second.body.status}`);
  say(`   черга диспетчера: ${(await api('/api/deliveries/waiting')).body.length} замовлення (order-1 і order-77, дубліката немає)`);
  say('   Перезапускаємо сервіс доставки (аварійно) і надсилаємо ту саму подію втретє...');
  await svc.delivery.stop();
  svc.delivery.start();
  await svc.delivery.waitHealthy();
  const third = await direct('delivery', '/internal/events', 'POST', envelope('evt-dup', 'order-77'));
  say(`   3-тє надсилання після перезапуску → ${third.status} ${third.body.status}  ← журнал оброблених подій збережено в базі даних`);
  say(`   черга диспетчера після перезапуску: ${(await api('/api/deliveries/waiting')).body.length} замовлення (дані збережено)`);

  say('\n=== 3. Транзакційний outbox: подія не втрачається при зупинці продуцента ===');
  await svc.delivery.stop();
  say('   сервіс доставки вимкнено (споживач недоступний)');
  show('POST /api/orders (order-5)', (await api('/api/orders', 'POST', order('order-5'))).status, undefined);
  show('POST /api/orders/order-5/confirm', (await api('/api/orders/order-5/confirm', 'POST')).status, (await api('/api/orders/order-5')).body);
  say('   Аварійно зупиняємо сервіс замовлень (подія була лише в його базі даних, не в пам’яті)...');
  await svc.orders.stop();
  svc.orders.start();
  await svc.orders.waitHealthy();
  show('GET /api/orders/order-5 після перезапуску', (await api('/api/orders/order-5')).status, (await api('/api/orders/order-5')).body);
  say('   Вмикаємо сервіс доставки...');
  svc.delivery.start();
  await svc.delivery.waitHealthy();
  const recovered = await until(async () => {
    const w = await api('/api/deliveries/waiting');
    return w.status === 200 && w.body.some((x: any) => x.orderId === 'order-5') ? w.body : false;
  }, 30000);
  say(`   Подію order.confirmed для order-5 доставлено після відновлення обох сервісів (черга: ${recovered.value.length} замовлень, через ${recovered.ms} мс).`);
  await sleep(500);
  say('\n=== Готово ===');
}

const shutdown = async () => Promise.all(names.map((n) => svc[n].stop()));
main()
  .then(shutdown)
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('Помилка демонстрації:', e.message);
    await shutdown();
    process.exit(1);
  });
