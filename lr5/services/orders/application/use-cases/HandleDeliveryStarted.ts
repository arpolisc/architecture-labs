import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { AppError } from '../errors';

export interface DeliveryStartedData {
  deliveryId: string;
  orderId: string;
  courierId: string;
}

/**
 * Споживач події delivery.started (v1): переводить замовлення в статус «у доставці».
 * Обробка ідемпотентна: повторна подія для вже обробленого замовлення нічого не змінює.
 */
export class HandleDeliveryStarted {
  constructor(private readonly orders: OrderRepository) {}

  async execute(data: DeliveryStartedData): Promise<void> {
    const order = await this.orders.findById(data.orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Замовлення не знайдено', 'not_found');
    if (order.status === 'IN_DELIVERY' && order.courierId === data.courierId) return;

    order.assignCourier(data.courierId);
    order.startDelivery();
    await this.orders.save(order);
  }
}
