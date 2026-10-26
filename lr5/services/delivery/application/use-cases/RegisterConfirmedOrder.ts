import { DispatchRequest } from '../../domain/entities/DispatchRequest';
import { DispatchQueueRepository } from '../../domain/repositories/DispatchQueueRepository';

export interface OrderConfirmedData {
  orderId: string;
  restaurantId: string;
  deliveryAddress: string;
}

/**
 * Споживач події order.confirmed (v1): додає замовлення до черги диспетчера.
 * Обробка ідемпотентна: запит для того самого замовлення створюється один раз.
 */
export class RegisterConfirmedOrder {
  constructor(private readonly queue: DispatchQueueRepository) {}

  async execute(data: OrderConfirmedData): Promise<void> {
    if (await this.queue.findByOrderId(data.orderId)) return;
    await this.queue.save(new DispatchRequest(data.orderId, data.restaurantId, data.deliveryAddress));
  }
}
