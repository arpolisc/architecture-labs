import { DomainError } from '../errors';

/**
 * Запит на доставку: локальна копія мінімального набору даних підтвердженого замовлення
 * (ідентифікатор, ресторан, адреса). Власник замовлення — сервіс замовлень; тут зберігається
 * лише те, що потрібно диспетчеру для ухвалення рішення про призначення кур’єра.
 */
export class DispatchRequest {
  constructor(
    public readonly orderId: string,
    public readonly restaurantId: string,
    public readonly deliveryAddress: string,
    private waiting = true,
  ) {
    if (!orderId.trim() || !restaurantId.trim() || !deliveryAddress.trim()) {
      throw new DomainError('Запит на доставку має містити замовлення, ресторан і адресу');
    }
  }

  get id(): string {
    return this.orderId;
  }

  get isWaiting(): boolean {
    return this.waiting;
  }

  ensureWaiting(): void {
    if (!this.waiting) throw new DomainError('Замовлення вже взято в доставку');
  }

  markTaken(): void {
    this.ensureWaiting();
    this.waiting = false;
  }
}
