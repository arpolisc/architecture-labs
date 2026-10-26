import { RestaurantRepository } from '../../domain/repositories/RestaurantRepository';
import { RestaurantDto, toRestaurantDto } from '../dto/RestaurantDto';
import { AppError } from '../errors';
import { EventPublisher } from '../ports/EventPublisher';
import { UnitOfWork } from '../ports/UnitOfWork';

/**
 * Призупинення та відновлення приймання замовлень рестораном. Операція ідемпотентна.
 * Якщо стан змінився, у тій самій локальній транзакції в outbox записується подія
 * restaurant.availability-changed (v1): за нею сервіс замовлень інвалідує свій кеш.
 */
export class SetAvailability {
  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly events: EventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(id: string, accepting: boolean): Promise<RestaurantDto> {
    const restaurant = await this.restaurants.findById(id);
    if (!restaurant) throw new AppError('RESTAURANT_NOT_FOUND', 'Ресторан не знайдено', 'not_found');

    const before = restaurant.isAcceptingOrders;
    if (accepting) restaurant.resumeAcceptingOrders();
    else restaurant.stopAcceptingOrders();

    await this.uow.run(async () => {
      await this.restaurants.save(restaurant);
      if (before !== restaurant.isAcceptingOrders) {
        this.events.publish('restaurant.availability-changed', 1, {
          restaurantId: restaurant.id,
          acceptingOrders: restaurant.isAcceptingOrders,
        });
      }
    });
    return toRestaurantDto(restaurant);
  }
}
