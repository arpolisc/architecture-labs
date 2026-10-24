import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';
import { AppError } from '../errors';
import { EventPublisher } from '../ports/EventPublisher';

/**
 * Сценарій 2: підтвердження замовлення рестораном.
 * Після збереження публікується подія order.confirmed (v1); результат обробки події споживачами
 * на відповідь цього сценарію не впливає.
 */
export class ConfirmOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventPublisher,
  ) {}

  async execute(orderId: string): Promise<OrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Замовлення не знайдено', 'not_found');

    order.confirm();
    await this.orders.save(order);
    this.events.publish('order.confirmed', 1, {
      orderId: order.id,
      customerId: order.customerId,
      restaurantId: order.restaurantId,
      deliveryAddress: order.deliveryAddress,
      items: [...order.items],
    });
    return toOrderDto(order);
  }
}
