import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import { requestJson } from '../shared/http/client';

const TS_NODE = require.resolve('ts-node/dist/bin.js');
const ROOT = path.resolve(__dirname, '..');

export type ServiceName = 'gateway' | 'orders' | 'restaurants' | 'delivery';

export function portsFrom(base: number): Record<ServiceName, number> {
  return { gateway: base, orders: base + 1, restaurants: base + 2, delivery: base + 3 };
}

/** Окремий процес ОС для кожного сервісу: запускається та зупиняється незалежно від інших. */
export class ManagedService {
  private child: ChildProcess | null = null;

  constructor(
    readonly name: ServiceName,
    private readonly ports: Record<ServiceName, number>,
    private readonly onLine: (name: string, line: string) => void = () => {},
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.ports[this.name]}`;
  }

  start(): void {
    if (this.child) return;
    const env = {
      ...process.env,
      TS_NODE_TRANSPILE_ONLY: '1',
      GATEWAY_PORT: String(this.ports.gateway),
      ORDERS_PORT: String(this.ports.orders),
      RESTAURANTS_PORT: String(this.ports.restaurants),
      DELIVERY_PORT: String(this.ports.delivery),
      ORDERS_URL: `http://127.0.0.1:${this.ports.orders}`,
      RESTAURANTS_URL: `http://127.0.0.1:${this.ports.restaurants}`,
      DELIVERY_URL: `http://127.0.0.1:${this.ports.delivery}`,
    };
    const child = spawn(process.execPath, [TS_NODE, path.join('services', this.name, 'main.ts')], { cwd: ROOT, env });
    const pipe = (stream: NodeJS.ReadableStream) => {
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        lines.filter(Boolean).forEach((l) => this.onLine(this.name, l));
      });
    };
    pipe(child.stdout!);
    pipe(child.stderr!);
    child.on('exit', () => {
      if (this.child === child) this.child = null;
    });
    this.child = child;
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
    this.child = null;
  }

  async waitHealthy(timeoutMs = 20000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await requestJson(`${this.url}/health`, { timeoutMs: 400 });
        if (r.status === 200) return;
      } catch {
        /* ще не запустився */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Сервіс ${this.name} не запустився за ${timeoutMs} мс`);
  }
}
