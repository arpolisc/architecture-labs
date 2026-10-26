import { randomUUID } from 'node:crypto';
import { SqlDatabase } from '../db/sqlite';
import { requestJson } from '../http/client';
import { EventEnvelope } from './envelope';

export interface Subscriber {
  /** Тип події, на яку підписаний споживач. */
  type: string;
  /** Адреса ендпоінта споживача, наприклад http://127.0.0.1:3001/internal/events */
  url: string;
}

export interface OutboxEntry {
  id: number;
  envelope: EventEnvelope;
  subscriberUrl: string;
  attempts: number;
  nextAttemptAt: number;
}

/** Сховище вихідної черги: у пам’яті (тести) або в базі даних сервісу (транзакційний outbox). */
export interface OutboxStore {
  add(envelope: EventEnvelope, subscriberUrls: string[]): void;
  due(now: number): OutboxEntry[];
  delivered(id: number): void;
  retry(id: number, attempts: number, nextAttemptAt: number): void;
  dead(id: number, attempts: number): void;
  pending(): number;
  deadEntries(): OutboxEntry[];
}

export class MemoryOutboxStore implements OutboxStore {
  private seq = 0;
  private readonly rows = new Map<number, OutboxEntry & { status: 'pending' | 'dead' }>();

  add(envelope: EventEnvelope, urls: string[]): void {
    for (const url of urls) {
      const id = ++this.seq;
      this.rows.set(id, { id, envelope, subscriberUrl: url, attempts: 0, nextAttemptAt: 0, status: 'pending' });
    }
  }
  due(now: number): OutboxEntry[] {
    return [...this.rows.values()].filter((r) => r.status === 'pending' && r.nextAttemptAt <= now);
  }
  delivered(id: number): void {
    this.rows.delete(id);
  }
  retry(id: number, attempts: number, nextAttemptAt: number): void {
    Object.assign(this.rows.get(id) ?? {}, { attempts, nextAttemptAt });
  }
  dead(id: number, attempts: number): void {
    Object.assign(this.rows.get(id) ?? {}, { attempts, status: 'dead' });
  }
  pending(): number {
    return [...this.rows.values()].filter((r) => r.status === 'pending').length;
  }
  deadEntries(): OutboxEntry[] {
    return [...this.rows.values()].filter((r) => r.status === 'dead');
  }
}

interface OutboxRow {
  id: number;
  payload: string;
  subscriber_url: string;
  attempts: number;
  next_attempt_at: number;
}

/** Транзакційний outbox: рядок додається в ту саму транзакцію, що й зміна даних сервісу. */
export class SqlOutboxStore implements OutboxStore {
  constructor(private readonly db: SqlDatabase) {}

  add(envelope: EventEnvelope, urls: string[]): void {
    this.db.transaction(() => {
      for (const url of urls) {
        this.db.run(
          'INSERT INTO outbox (event_id, event_type, payload, subscriber_url) VALUES (?, ?, ?, ?)',
          [envelope.eventId, envelope.type, JSON.stringify(envelope), url],
        );
      }
    });
  }

  due(now: number): OutboxEntry[] {
    return this.db
      .all<OutboxRow>(
        "SELECT id, payload, subscriber_url, attempts, next_attempt_at FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id",
        [now],
      )
      .map(this.toEntry);
  }

  delivered(id: number): void {
    this.db.transaction(() => this.db.run('DELETE FROM outbox WHERE id = ?', [id]));
  }

  retry(id: number, attempts: number, nextAttemptAt: number): void {
    this.db.transaction(() =>
      this.db.run('UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?', [attempts, nextAttemptAt, id]),
    );
  }

  dead(id: number, attempts: number): void {
    this.db.transaction(() =>
      this.db.run("UPDATE outbox SET attempts = ?, status = 'dead' WHERE id = ?", [attempts, id]),
    );
  }

  pending(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'")?.n ?? 0;
  }

  deadEntries(): OutboxEntry[] {
    return this.db
      .all<OutboxRow>("SELECT id, payload, subscriber_url, attempts, next_attempt_at FROM outbox WHERE status = 'dead'")
      .map(this.toEntry);
  }

  private toEntry = (r: OutboxRow): OutboxEntry => ({
    id: r.id,
    envelope: JSON.parse(r.payload) as EventEnvelope,
    subscriberUrl: r.subscriber_url,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
  });
}

export interface OutboxOptions {
  producer: string;
  subscribers: Subscriber[];
  store?: OutboxStore;
  retryIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  log?: (message: string) => void;
}

/**
 * Вихідна черга подій із доставкою «щонайменше один раз».
 * publish() лише ставить подію в чергу (у транзакції сервісу) й повертається одразу: продуцент не чекає споживача.
 * Недоступний споживач отримує подію пізніше; повторні спроби йдуть із експоненційною затримкою.
 * Якщо сховищем є база даних сервісу, подія переживає перезапуск процесу.
 */
export class Outbox {
  private readonly store: OutboxStore;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly retryIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(private readonly options: OutboxOptions) {
    this.store = options.store ?? new MemoryOutboxStore();
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
    const urls = this.options.subscribers.filter((s) => s.type === type).map((s) => s.url);
    this.store.add(envelope, urls);
    setImmediate(() => void this.tick());
    return envelope;
  }

  get pending(): number {
    return this.store.pending();
  }

  get deadLetters(): OutboxEntry[] {
    return this.store.deadEntries();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const entry of this.store.due(Date.now())) await this.attempt(entry);
    } finally {
      this.running = false;
    }
  }

  private async attempt(entry: OutboxEntry): Promise<void> {
    const attempts = entry.attempts + 1;
    const label = `${entry.envelope.type} ${entry.envelope.eventId.slice(0, 8)} → ${entry.subscriberUrl}`;
    try {
      const response = await requestJson(entry.subscriberUrl, {
        method: 'POST',
        body: entry.envelope,
        timeoutMs: this.timeoutMs,
      });
      if (response.status >= 200 && response.status < 300) {
        this.store.delivered(entry.id);
        this.options.log?.(`outbox: доставлено ${label} (спроба ${attempts})`);
        return;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        this.store.dead(entry.id, attempts);
        this.options.log?.(`outbox: споживач відхилив ${label}, статус ${response.status}; подію перенесено в dead-letter`);
        return;
      }
      this.scheduleRetry(entry, attempts, `статус ${response.status}`);
    } catch (error) {
      this.scheduleRetry(entry, attempts, error instanceof Error ? error.message : String(error));
    }
  }

  private scheduleRetry(entry: OutboxEntry, attempts: number, reason: string): void {
    if (attempts >= this.maxAttempts) {
      this.store.dead(entry.id, attempts);
      this.options.log?.(`outbox: вичерпано спроби для ${entry.envelope.type}, подію перенесено в dead-letter`);
      return;
    }
    const delay = Math.min(this.retryIntervalMs * 2 ** (attempts - 1), 5000);
    this.store.retry(entry.id, attempts, Date.now() + delay);
    if (attempts === 1) {
      this.options.log?.(`outbox: споживач недоступний (${reason}); повтор через ${delay} мс`);
    }
  }
}
