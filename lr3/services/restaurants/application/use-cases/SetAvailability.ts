import { RestaurantRepository } from '../../domain/repositories/RestaurantRepository';
import { RestaurantDto, toRestaurantDto } from '../dto/RestaurantDto';
import { AppError } from '../errors';

/** Призупинення та відновлення приймання замовлень рестораном. Операція ідемпотентна. */
export class SetAvailability {
  constructor(private readonly restaurants: RestaurantRepository) {}

  async execute(id: string, accepting: boolean): Promise<RestaurantDto> {
    const restaurant = await this.restaurants.findById(id);
    if (!restaurant) throw new AppError('RESTAURANT_NOT_FOUND', 'Ресторан не знайдено', 'not_found');
    if (accepting) restaurant.resumeAcceptingOrders();
    else restaurant.stopAcceptingOrders();
    await this.restaurants.save(restaurant);
    return toRestaurantDto(restaurant);
  }
}
