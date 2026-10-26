/** Порт публікації подій. Публікація не чекає на споживачів. */
export interface EventPublisher {
  publish(type: string, version: number, data: object): void;
}
