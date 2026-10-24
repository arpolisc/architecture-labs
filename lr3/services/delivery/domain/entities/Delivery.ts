import { DomainError } from '../errors';

export type DeliveryStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

/** Доставка (у глосарії ЛР1 — «Призначення доставки»): зв’язок замовлення з кур’єром. */
export class Delivery {
  private state: DeliveryStatus = 'ASSIGNED';

  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly courierId: string,
  ) {
    if (!id.trim() || !orderId.trim() || !courierId.trim()) {
      throw new DomainError('Доставка має містити ID, замовлення та кур’єра');
    }
  }

  get status(): DeliveryStatus {
    return this.state;
  }

  start(): void {
    if (this.state !== 'ASSIGNED') throw new DomainError('Можна почати лише призначену доставку');
    this.state = 'IN_PROGRESS';
  }

  complete(): void {
    if (this.state !== 'IN_PROGRESS') throw new DomainError('Можна завершити лише розпочату доставку');
    this.state = 'COMPLETED';
  }
}
