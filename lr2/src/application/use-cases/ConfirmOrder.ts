import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';

/** Сценарій 2: підтвердження замовлення рестораном. */
export class ConfirmOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<OrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error('Замовлення не знайдено');

    order.confirm();
    await this.orders.save(order);
    return toOrderDto(order);
  }
}
