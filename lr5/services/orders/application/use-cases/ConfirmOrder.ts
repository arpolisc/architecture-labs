import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';
import { AppError } from '../errors';
import { EventPublisher } from '../ports/EventPublisher';
import { UnitOfWork } from '../ports/UnitOfWork';

/**
 * Сценарій 2: підтвердження замовлення рестораном.
 * Зміна статусу й запис події order.confirmed (v1) в outbox фіксуються однією локальною транзакцією:
 * подія не може бути втрачена, якщо замовлення збережено, і не з’явиться, якщо збереження скасовано.
 * Результат обробки події споживачами на відповідь цього сценарію не впливає.
 */
export class ConfirmOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(orderId: string): Promise<OrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Замовлення не знайдено', 'not_found');

    order.confirm();
    await this.uow.run(async () => {
      await this.orders.save(order);
      this.events.publish('order.confirmed', 1, {
        orderId: order.id,
        customerId: order.customerId,
        restaurantId: order.restaurantId,
        deliveryAddress: order.deliveryAddress,
        items: [...order.items],
      });
    });
    return toOrderDto(order);
  }
}
