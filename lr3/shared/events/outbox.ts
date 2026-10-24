import { randomUUID } from 'node:crypto';
import { requestJson } from '../http/client';
import { EventEnvelope } from './envelope';

export interface Subscriber {
  /** Тип події, на яку підписаний споживач. */
  type: string;
  /** Адреса ендпоінта споживача, наприклад http://127.0.0.1:3001/internal/events */
  url: string;
}

export interface OutboxOptions {
  producer: string;
  subscribers: Subscriber[];
  retryIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  log?: (message: string) => void;
}

interface Delivery {
  envelope: EventEnvelope;
  subscriber: Subscriber;
  attempts: number;
  nextAttemptAt: number;
}

/**
 * Вихідна черга подій (outbox) з доставкою «щонайменше один раз».
 * publish() лише ставить подію в чергу й повертається одразу: продуцент не чекає споживача.
 * Недоступний споживач отримує подію пізніше, повторні спроби йдуть із експоненційною затримкою.
 */
export class Outbox {
  private readonly queue: Delivery[] = [];
  readonly deadLetters: Delivery[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly retryIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(private readonly options: OutboxOptions) {
    this.retryIntervalMs = options.retryIntervalMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.maxAttempts = options.maxAttempts ?? 20;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), Math.max(20, Math.floor(this.retryIntervalMs / 2)));
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  publish<T>(type: string, version: number, data: T): EventEnvelope<T> {
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      type,
      version,
      occurredAt: new Date().toISOString(),
      producer: this.options.producer,
      data,
    };
    for (const subscriber of this.options.subscribers.filter((s) => s.type === type)) {
      this.queue.push({ envelope, subscriber, attempts: 0, nextAttemptAt: 0 });
    }
    setImmediate(() => void this.tick());
    return envelope;
  }

  get pending(): number {
    return this.queue.length;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      for (const item of [...this.queue]) {
        if (item.nextAttemptAt > now) continue;
        await this.attempt(item);
      }
    } finally {
      this.running = false;
    }
  }

  private async attempt(item: Delivery): Promise<void> {
    item.attempts += 1;
    const label = `${item.envelope.type} ${item.envelope.eventId.slice(0, 8)} → ${item.subscriber.url}`;
    try {
      const response = await requestJson(item.subscriber.url, {
        method: 'POST',
        body: item.envelope,
        timeoutMs: this.timeoutMs,
      });
      if (response.status >= 200 && response.status < 300) {
        this.remove(item);
        this.options.log?.(`outbox: доставлено ${label} (спроба ${item.attempts})`);
        return;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        this.remove(item);
        this.deadLetters.push(item);
        this.options.log?.(`outbox: споживач відхилив ${label}, статус ${response.status}; подію перенесено в dead-letter`);
        return;
      }
      this.scheduleRetry(item, `статус ${response.status}`);
    } catch (error) {
      this.scheduleRetry(item, error instanceof Error ? error.message : String(error));
    }
  }

  private scheduleRetry(item: Delivery, reason: string): void {
    if (item.attempts >= this.maxAttempts) {
      this.remove(item);
      this.deadLetters.push(item);
      this.options.log?.(`outbox: вичерпано спроби для ${item.envelope.type}, подію перенесено в dead-letter`);
      return;
    }
    const delay = Math.min(this.retryIntervalMs * 2 ** (item.attempts - 1), 5000);
    item.nextAttemptAt = Date.now() + delay;
    if (item.attempts === 1) {
      this.options.log?.(`outbox: споживач недоступний (${reason}); повтор через ${delay} мс`);
    }
  }

  private remove(item: Delivery): void {
    const index = this.queue.indexOf(item);
    if (index >= 0) this.queue.splice(index, 1);
  }
}
