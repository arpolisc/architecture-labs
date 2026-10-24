import { Order } from '../../domain/entities/Order';
import { CustomerRepository } from '../../domain/repositories/CustomerRepository';
import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { RestaurantRepository } from '../../domain/repositories/RestaurantRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';

export interface CreateOrderCommand {
  id: string;
  customerId: string;
  restaurantId: string;
  deliveryAddress: string;
  items: string[];
}

/** Сценарій 1: створення замовлення. */
export class CreateOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly restaurants: RestaurantRepository,
  ) {}

  async execute(command: CreateOrderCommand): Promise<OrderDto> {
    const customer = await this.customers.findById(command.customerId);
    if (!customer) throw new Error('Клієнта не знайдено');

    const restaurant = await this.restaurants.findById(command.restaurantId);
    if (!restaurant) throw new Error('Ресторан не знайдено');
    restaurant.ensureCanAcceptOrder();

    if (await this.orders.findById(command.id)) {
      throw new Error('Замовлення з таким ID вже існує');
    }

    const order = Order.create(
      command.id,
      customer.id,
      restaurant.id,
      command.deliveryAddress,
      command.items,
    );
    await this.orders.save(order);
    return toOrderDto(order);
  }
}
