import { RestaurantRepository } from '../../domain/repositories/RestaurantRepository';
import { RestaurantDto, toRestaurantDto } from '../dto/RestaurantDto';
import { AppError } from '../errors';

/** Відповідь на синхронний запит сервісу замовлень: чи приймає ресторан замовлення. */
export class GetRestaurant {
  constructor(private readonly restaurants: RestaurantRepository) {}

  async execute(id: string): Promise<RestaurantDto> {
    const restaurant = await this.restaurants.findById(id);
    if (!restaurant) throw new AppError('RESTAURANT_NOT_FOUND', 'Ресторан не знайдено', 'not_found');
    return toRestaurantDto(restaurant);
  }
}
