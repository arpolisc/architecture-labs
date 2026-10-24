import { Restaurant } from '../domain/entities/Restaurant';
import { RestaurantRepository } from '../domain/repositories/RestaurantRepository';

/** Власне сховище сервісу ресторанів. */
export class InMemoryRestaurantRepository implements RestaurantRepository {
  private readonly items = new Map<string, Restaurant>();

  async findById(id: string): Promise<Restaurant | null> {
    return this.items.get(id) ?? null;
  }

  async save(restaurant: Restaurant): Promise<void> {
    this.items.set(restaurant.id, restaurant);
  }
}
