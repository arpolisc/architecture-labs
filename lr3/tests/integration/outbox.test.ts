import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { Outbox } from '../../shared/events/outbox';
import { eventually } from '../helpers/system';

function stub(statusFor: (call: number) => number) {
  const received: any[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(statusFor(received.length), { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  return {
    received,
    start: () => new Promise<string>((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

describe('Outbox: доставка подій щонайменше один раз', () => {
  test('повторює доставку при 5xx і зупиняється після успіху; eventId однаковий', async () => {
    const s = stub((call) => (call < 3 ? 503 : 200));
    const url = await s.start();
    const outbox = new Outbox({ producer: 't', subscribers: [{ type: 'x.y', url }], retryIntervalMs: 20 });
    outbox.start();
    outbox.publish('x.y', 1, { a: 1 });
    await eventually(async () => outbox.pending === 0);
    outbox.stop();
    await s.stop();
    expect(s.received.length).toBe(3);
    expect(new Set(s.received.map((e) => e.eventId)).size).toBe(1);
  });

  test('4xx — споживач відхилив подію: перенесення в dead-letter без нескінченних повторів', async () => {
    const s = stub(() => 422);
    const url = await s.start();
    const outbox = new Outbox({ producer: 't', subscribers: [{ type: 'x.y', url }], retryIntervalMs: 20 });
    outbox.start();
    outbox.publish('x.y', 1, {});
    await eventually(async () => outbox.deadLetters.length === 1);
    outbox.stop();
    await s.stop();
    expect(s.received.length).toBe(1);
    expect(outbox.pending).toBe(0);
  });

  test('подія доставляється лише підписаним на її тип споживачам', async () => {
    const a = stub(() => 200);
    const b = stub(() => 200);
    const [ua, ub] = [await a.start(), await b.start()];
    const outbox = new Outbox({ producer: 't', subscribers: [{ type: 'one', url: ua }, { type: 'two', url: ub }], retryIntervalMs: 20 });
    outbox.start();
    outbox.publish('one', 1, {});
    await eventually(async () => outbox.pending === 0);
    outbox.stop();
    await a.stop(); await b.stop();
    expect(a.received.length).toBe(1);
    expect(b.received.length).toBe(0);
  });
});
