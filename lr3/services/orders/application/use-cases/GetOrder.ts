import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';
import { AppError } from '../errors';

export class GetOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<OrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Замовлення не знайдено', 'not_found');
    return toOrderDto(order);
  }
}
