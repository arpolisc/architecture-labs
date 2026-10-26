import { Order } from '../../domain/entities/Order';
import { CustomerRepository } from '../../domain/repositories/CustomerRepository';
import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';
import { AppError } from '../errors';
import { UnitOfWork } from '../ports/UnitOfWork';
import { DirectoryUnavailableError, RestaurantDirectory } from '../ports/RestaurantDirectory';

export interface CreateOrderCommand {
  id: string;
  customerId: string;
  restaurantId: string;
  deliveryAddress: string;
  items: string[];
}

export interface CreateOrderResult {
  order: OrderDto;
  /** false — повторний запит із тим самим ID та тими самими даними (ідемпотентність). */
  created: boolean;
}

/**
 * Сценарій 1: створення замовлення.
 * Синхронний виклик сервісу ресторанів: якщо він недоступний, замовлення не приймається
 * (поведінка за відмови: помилка DEPENDENCY_UNAVAILABLE, клієнт може повторити запит).
 */
export class CreateOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly restaurants: RestaurantDirectory,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateOrderCommand): Promise<CreateOrderResult> {
    const customer = await this.customers.findById(command.customerId);
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Клієнта не знайдено', 'not_found');

    // Ідемпотентність за ID замовлення: повтор того самого запиту повертає наявне замовлення.
    const existing = await this.orders.findById(command.id);
    if (existing) {
      const same =
        existing.customerId === command.customerId &&
        existing.restaurantId === command.restaurantId &&
        existing.deliveryAddress === command.deliveryAddress.trim() &&
        JSON.stringify(existing.items) === JSON.stringify(command.items);
      if (!same) {
        throw new AppError('ORDER_ID_CONFLICT', 'Замовлення з таким ID вже існує з іншими даними', 'conflict');
      }
      return { order: toOrderDto(existing), created: false };
    }

    const restaurant = await this.findRestaurant(command.restaurantId);
    if (!restaurant) throw new AppError('RESTAURANT_NOT_FOUND', 'Ресторан не знайдено', 'not_found');
    if (!restaurant.acceptingOrders) {
      throw new AppError('RESTAURANT_NOT_ACCEPTING', 'Ресторан тимчасово не приймає замовлення', 'unprocessable');
    }

    const order = Order.create(command.id, customer.id, command.restaurantId, command.deliveryAddress, command.items);
    await this.uow.run(() => this.orders.save(order));
    return { order: toOrderDto(order), created: true };
  }

  private async findRestaurant(id: string) {
    try {
      return await this.restaurants.find(id);
    } catch (error) {
      if (error instanceof DirectoryUnavailableError) {
        throw new AppError(
          'DEPENDENCY_UNAVAILABLE',
          'Сервіс ресторанів тимчасово недоступний, повторіть спробу пізніше',
          'unavailable',
        );
      }
      throw error;
    }
  }
}
