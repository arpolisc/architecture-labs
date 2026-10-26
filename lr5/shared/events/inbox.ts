import { SqlDatabase } from '../db/sqlite';
import { Transactional } from '../db/uow';
import { Handler } from '../http/router';
import { EventEnvelope, isEnvelope } from './envelope';

export type EventHandler = (envelope: EventEnvelope) => Promise<void>;

/** Журнал уже оброблених подій (за eventId): основа ідемпотентності споживача. */
export interface ProcessedEventStore {
  has(eventId: string): boolean;
  add(eventId: string): void;
}

export class MemoryProcessedEvents implements ProcessedEventStore {
  private readonly ids = new Set<string>();
  has(eventId: string): boolean {
    return this.ids.has(eventId);
  }
  add(eventId: string): void {
    this.ids.add(eventId);
  }
}

/** Журнал у базі даних сервісу: переживає перезапуск і фіксується в одній транзакції з наслідками обробки. */
export class SqlProcessedEvents implements ProcessedEventStore {
  constructor(private readonly db: SqlDatabase) {}

  has(eventId: string): boolean {
    return this.db.get('SELECT 1 AS x FROM processed_events WHERE event_id = ?', [eventId]) !== undefined;
  }

  add(eventId: string): void {
    this.db.transaction(() =>
      this.db.run('INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?, ?)', [
        eventId,
        new Date().toISOString(),
      ]),
    );
  }
}

export interface EventEndpointOptions {
  store?: ProcessedEventStore;
  /** Якщо задано, перевірка дубліката, обробка та запис в журнал виконуються в одній транзакції. */
  transaction?: Transactional;
}

/**
 * HTTP-ендпоінт споживача подій. Забезпечує ідемпотентність: подія з уже оброблених eventId
 * підтверджується без повторної обробки (доставка «щонайменше один раз»).
 */
export function eventEndpoint(handlers: Record<string, EventHandler>, options: EventEndpointOptions = {}): Handler {
  const store = options.store ?? new MemoryProcessedEvents();
  const inTransaction = <T>(fn: () => Promise<T>) => (options.transaction ? options.transaction.run(fn) : fn());

  return async (ctx) => {
    if (!isEnvelope(ctx.body)) {
      return { status: 400, body: { error: { code: 'VALIDATION_FAILED', message: 'Невірна структура події' } } };
    }
    const envelope = ctx.body;
    const handler = handlers[`${envelope.type}.v${envelope.version}`];
    const status = await inTransaction(async () => {
      if (store.has(envelope.eventId)) return 'duplicate';
      if (!handler) return 'ignored';
      await handler(envelope);
      store.add(envelope.eventId);
      return 'processed';
    });
    return { status: 200, body: { status } };
  };
}
