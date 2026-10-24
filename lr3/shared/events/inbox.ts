import { Handler } from '../http/router';
import { EventEnvelope, isEnvelope } from './envelope';

export type EventHandler = (envelope: EventEnvelope) => Promise<void>;

/**
 * HTTP-ендпоінт споживача подій. Забезпечує ідемпотентність: подія з уже
 * оброблених eventId підтверджується без повторної обробки (доставка «щонайменше один раз»).
 */
export function eventEndpoint(handlers: Record<string, EventHandler>, processed: Set<string> = new Set()): Handler {
  return async (ctx) => {
    if (!isEnvelope(ctx.body)) {
      return { status: 400, body: { error: { code: 'VALIDATION_FAILED', message: 'Невірна структура події' } } };
    }
    const envelope = ctx.body;
    if (processed.has(envelope.eventId)) {
      return { status: 200, body: { status: 'duplicate' } };
    }
    const handler = handlers[`${envelope.type}.v${envelope.version}`];
    if (!handler) {
      return { status: 200, body: { status: 'ignored' } };
    }
    await handler(envelope);
    processed.add(envelope.eventId);
    return { status: 200, body: { status: 'processed' } };
  };
}
