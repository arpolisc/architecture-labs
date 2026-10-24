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
    if (!id.trim()) throw new Error('ID замовлення обов’язковий');
    if (!customerId.trim()) throw new Error('Замовлення має належати клієнту');
    if (!restaurantId.trim()) throw new Error('Замовлення має належати ресторану');
    if (!deliveryAddress.trim()) throw new Error('Адреса доставки не може бути порожньою');
    if (!items.length || items.some((x) => !x.trim())) {
      throw new Error('Замовлення повинно містити щонайменше одну позицію');
    }
    return new Order(id, customerId, restaurantId, deliveryAddress.trim(), [...items]);
  }

  get status(): OrderStatus {
    return this.state;
  }

  get courierId(): string | null {
    return this.courier;
  }

  confirm(): void {
    if (this.state !== 'NEW') throw new Error('Підтвердити можна лише нове замовлення');
    this.state = 'CONFIRMED';
  }

  assignCourier(courierId: string): void {
    if (this.state !== 'CONFIRMED') {
      throw new Error('Кур’єра можна призначити лише підтвердженому замовленню');
    }
    if (!courierId.trim()) throw new Error('ID кур’єра обов’язковий');
    this.courier = courierId;
  }

  startDelivery(): void {
    if (this.state !== 'CONFIRMED') {
      throw new Error('Доставку можна почати лише для підтвердженого замовлення');
    }
    if (!this.courier) throw new Error('Спочатку потрібно призначити кур’єра');
    this.state = 'IN_DELIVERY';
  }

  markDelivered(): void {
    if (this.state !== 'IN_DELIVERY') {
      throw new Error('Завершити можна лише замовлення в доставці');
    }
    this.state = 'DELIVERED';
  }

  cancel(): void {
    if (this.state === 'CANCELLED') throw new Error('Замовлення вже скасоване');
    if (this.state === 'IN_DELIVERY' || this.state === 'DELIVERED') {
      throw new Error('Замовлення в доставці або доставлене скасувати не можна');
    }
    this.state = 'CANCELLED';
  }
}
