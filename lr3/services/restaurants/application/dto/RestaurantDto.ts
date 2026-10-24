import { Restaurant } from '../../domain/entities/Restaurant';

export interface RestaurantDto {
  id: string;
  name: string;
  acceptingOrders: boolean;
}

export function toRestaurantDto(restaurant: Restaurant): RestaurantDto {
  return { id: restaurant.id, name: restaurant.name, acceptingOrders: restaurant.isAcceptingOrders };
}
