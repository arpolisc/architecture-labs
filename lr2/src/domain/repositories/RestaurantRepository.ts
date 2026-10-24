import { Restaurant } from '../entities/Restaurant';

export interface RestaurantRepository {
  findById(id: string): Promise<Restaurant | null>;
  save(restaurant: Restaurant): Promise<void>;
}
