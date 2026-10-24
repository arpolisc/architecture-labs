import { requestJson } from '../shared/http/client';
import { ManagedService, portsFrom, ServiceName } from './processes';

const base = Number(process.env.BASE_PORT ?? 3000);
const ports = portsFrom(base);
const gateway = `http://127.0.0.1:${ports.gateway}`;
const names: ServiceName[] = ['restaurants', 'delivery', 'orders', 'gateway'];
const svc = Object.fromEntries(
  names.map((n) => [n, new ManagedService(n, ports, (name, line) => {
    if (/outbox:/.test(line)) console.log(`      · [${name}] ${line.replace(/^\[\w+\]\s*/, '')}`);
  })]),
) as Record<ServiceName, ManagedService>;

const api = (path: string, method = 'GET', body?: unknown) => requestJson(`${gateway}${path}`, { method, body, timeoutMs: 6000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (text: string) => console.log(text);
const show = (label: string, status: number, body: any, ms?: number) => {
  const detail = body?.error ? `${body.error.code}` : body?.status ?? (Array.isArray(body) ? `${body.length} шт.` : '');
  say(`   ${label} → ${status}${detail ? ` ${detail}` : ''}${ms !== undefined ? ` (${ms} мс)` : ''}`);
};
const timed = async <T>(fn: () => Promise<T>) => {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
};
async function until<T>(fn: () => Promise<T | false>, timeoutMs = 20000): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    const v = await fn();
    if (v) return { value: v, ms: Date.now() - t };
    await sleep(100);
  }
  throw new Error('Очікуваний стан не настав');
}
const newOrder = (id: string) => ({ id, customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, вул. Хрещатик, 10', items: ['Борщ', 'Вареники'] });

async function main() {
  say('=== Запуск чотирьох незалежних процесів (кожен зі своїми даними) ===');
  names.forEach((n) => svc[n].start());
  await Promise.all(names.map((n) => svc[n].waitHealthy()));
  const health = await api('/api/health');
  say(`   GET /api/health → ${health.status} ${JSON.stringify(health.body.services)}`);

  say('\n=== Експеримент 1. Синхронний виклик: замовлення → ресторани (тайм-аут 1000 мс) ===');
  let r = await api('/api/orders', 'POST', newOrder('order-1'));
  show('1.1 Усе працює: POST /api/orders (order-1)', r.status, r.body);
  say('1.2 Вимикаємо сервіс ресторанів...');
  await svc.restaurants.stop();
  const failed = await timed(() => api('/api/orders', 'POST', newOrder('order-2')));
  show('1.3 POST /api/orders (order-2)', failed.value.status, failed.value.body, failed.ms);
  say('     Поведінка за відмови: замовлення не приймається, клієнт отримує 503 та Retry-After.');
  r = await api('/api/orders', 'POST', newOrder('order-1'));
  show('1.4 Повтор order-1 (ідемпотентність, ресторани не потрібні)', r.status, r.body);
  r = await api('/api/orders/order-1');
  show('1.5 GET /api/orders/order-1 (сервіс замовлень працює)', r.status, r.body);
  say('1.6 Вмикаємо сервіс ресторанів...');
  svc.restaurants.start();
  await svc.restaurants.waitHealthy();
  r = await api('/api/orders', 'POST', newOrder('order-2'));
  show('     POST /api/orders (order-2) після відновлення', r.status, r.body);

  say('\n=== Експеримент 2. Асинхронна подія order.confirmed: замовлення → доставка ===');
  say('2.1 Вимикаємо сервіс доставки (споживача події)...');
  await svc.delivery.stop();
  const confirmed = await timed(() => api('/api/orders/order-1/confirm', 'POST'));
  show('2.2 POST /api/orders/order-1/confirm', confirmed.value.status, confirmed.value.body, confirmed.ms);
  say('     Продуцент не чекає споживача: підтвердження виконано, подія чекає в черзі outbox.');
  r = await api('/api/deliveries/waiting');
  show('2.3 GET /api/deliveries/waiting (доставка вимкнена)', r.status, r.body);
  say('2.4 Вмикаємо сервіс доставки (порожня черга диспетчера)...');
  svc.delivery.start();
  await svc.delivery.waitHealthy();
  const delivered = await until(async () => {
    const w = await api('/api/deliveries/waiting');
    return w.status === 200 && w.body.length === 1 ? w.body : false;
  });
  say(`     Подію доставлено після відновлення: у черзі диспетчера ${delivered.value.length} замовлення (через ${delivered.ms} мс після відновлення сервісу).`);

  say('\n=== Асинхронна подія delivery.started: доставка → замовлення ===');
  r = await api('/api/deliveries', 'POST', { orderId: 'order-1', courierId: 'courier-1' });
  show('2.5 POST /api/deliveries (courier-1)', r.status, r.body);
  const inDelivery = await until(async () => {
    const o = await api('/api/orders/order-1');
    return o.body.status === 'IN_DELIVERY' ? o.body : false;
  });
  say(`     Статус order-1: ${inDelivery.value.status}, кур'єр ${inDelivery.value.courierId} (через ${inDelivery.ms} мс).`);
  r = await api('/api/deliveries', 'POST', { orderId: 'order-1', courierId: 'courier-1' });
  show('2.6 Повтор POST /api/deliveries (ідемпотентність)', r.status, r.body);
  r = await requestJson(`${gateway}/internal/events`, { method: 'POST', body: {}, timeoutMs: 2000 });
  show('2.7 Спроба зовнішнього доступу до /internal/events', r.status, r.body);

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
