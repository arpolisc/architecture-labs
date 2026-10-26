/** Обгортка події: спільна для всіх подій (див. contracts/events/envelope.schema.json). */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: string;
  data: T;
}

export function isEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eventId === 'string' &&
    typeof v.type === 'string' &&
    typeof v.version === 'number' &&
    typeof v.occurredAt === 'string' &&
    typeof v.producer === 'string' &&
    typeof v.data === 'object' &&
    v.data !== null
  );
}
