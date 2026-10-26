import { RestaurantCache } from '../ports/RestaurantCache';

/**
 * Споживач події restaurant.availability-changed (v1): вилучає запис ресторану з кешу.
 * Інвалідизація не залежить від порядку надходження подій і ідемпотентна за своєю природою.
 */
export class InvalidateRestaurantCache {
  constructor(private readonly cache: RestaurantCache) {}

  async execute(data: { restaurantId: string }): Promise<void> {
    this.cache.invalidate(data.restaurantId);
  }
}
