import { Restaurant } from '../../domain/entities/Restaurant';
import { RestaurantRepository } from '../../domain/repositories/RestaurantRepository';
import { InMemoryRepository } from './InMemoryRepository';

export class InMemoryRestaurantRepository
  extends InMemoryRepository<Restaurant>
  implements RestaurantRepository {}
