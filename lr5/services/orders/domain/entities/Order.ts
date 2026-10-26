import { DomainError } from '../errors';

export type OrderStatus = 'NEW' | 'CONFIRMED' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED';

/**
 * Замовлення. Відповідність статусів глосарію ЛР1:
 * NEW — «створене», CONFIRMED — «підтверджене», IN_DELIVERY — «у доставці»,
 * DELIVERED — «виконане», CANCELLED — «скасоване».
 */
export class Order {
  private constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly restaurantId: string,
    public readonly deliveryAddress: string,
    public readonly items: readonly string[],
    private state: OrderStatus = 'NEW',
    private courier: string | null = null,
  ) {}

  static create(
    id: string,
    customerId: string,
    restaurantId: string,
    deliveryAddress: string,
    items: string[],
  ): Order {
    if (!id.trim()) throw new DomainError('ID замовлення обов’язковий');
    if (!customerId.trim()) throw new DomainError('Замовлення має належати клієнту');
    if (!restaurantId.trim()) throw new DomainError('Замовлення має належати ресторану');
    if (!deliveryAddress.trim()) throw new DomainError('Адреса доставки не може бути порожньою');
    if (!items.length || items.some((x) => !x.trim())) {
      throw new DomainError('Замовлення повинно містити щонайменше одну позицію');
    }
    return new Order(id, customerId, restaurantId, deliveryAddress.trim(), [...items]);
  }

  /**
   * Відновлення замовлення із сховища. Дані вже пройшли перевірки під час створення,
   * тому інваріанти повторно не перевіряються; нові доменні правила тут не додаються.
   */
  static restore(snapshot: {
    id: string;
    customerId: string;
    restaurantId: string;
    deliveryAddress: string;
    items: string[];
    status: OrderStatus;
    courierId: string | null;
  }): Order {
    return new Order(
      snapshot.id,
      snapshot.customerId,
      snapshot.restaurantId,
      snapshot.deliveryAddress,
      [...snapshot.items],
      snapshot.status,
      snapshot.courierId,
    );
  }

  get status(): OrderStatus {
    return this.state;
  }

  get courierId(): string | null {
    return this.courier;
  }

  confirm(): void {
    if (this.state !== 'NEW') throw new DomainError('Підтвердити можна лише нове замовлення');
    this.state = 'CONFIRMED';
  }

  assignCourier(courierId: string): void {
    if (this.state !== 'CONFIRMED') {
      throw new DomainError('Кур’єра можна призначити лише підтвердженому замовленню');
    }
    if (!courierId.trim()) throw new DomainError('ID кур’єра обов’язковий');
    this.courier = courierId;
  }

  startDelivery(): void {
    if (this.state !== 'CONFIRMED') {
      throw new DomainError('Доставку можна почати лише для підтвердженого замовлення');
    }
    if (!this.courier) throw new DomainError('Спочатку потрібно призначити кур’єра');
    this.state = 'IN_DELIVERY';
  }

  markDelivered(): void {
    if (this.state !== 'IN_DELIVERY') {
      throw new DomainError('Завершити можна лише замовлення в доставці');
    }
    this.state = 'DELIVERED';
  }

  cancel(): void {
    if (this.state === 'CANCELLED') throw new DomainError('Замовлення вже скасоване');
    if (this.state === 'IN_DELIVERY' || this.state === 'DELIVERED') {
      throw new DomainError('Замовлення в доставці або доставлене скасувати не можна');
    }
    this.state = 'CANCELLED';
  }
}
