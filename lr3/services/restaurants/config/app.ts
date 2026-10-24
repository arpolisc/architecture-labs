import { GetRestaurant } from '../application/use-cases/GetRestaurant';
import { SetAvailability } from '../application/use-cases/SetAvailability';
import { Restaurant } from '../domain/entities/Restaurant';
import { InMemoryRestaurantRepository } from '../infrastructure/InMemoryRestaurantRepository';
import { mapError } from '../presentation/errors';
import { buildRouter } from '../presentation/http';
import { errorResult } from '../../../shared/http/errors';
import { close, createJsonServer, listen } from '../../../shared/http/router';

export interface RestaurantsOptions {
  port: number;
}

/** Єдина точка складання сервісу ресторанів. */
export function createRestaurantsApp(options: RestaurantsOptions) {
  const restaurants = new InMemoryRestaurantRepository();
  const seeded = Promise.all([
    restaurants.save(new Restaurant('rest-1', 'Ресторан Смачно')),
    restaurants.save(new Restaurant('rest-2', 'Піцерія Рома')),
  ]);
  const router = buildRouter({
    getRestaurant: new GetRestaurant(restaurants),
    setAvailability: new SetAvailability(restaurants),
  });
  const server = createJsonServer(router, mapError, errorResult(404, 'NOT_FOUND', 'Маршрут не знайдено'));

  return {
    name: 'restaurants',
    async start(): Promise<number> {
      await seeded;
      return listen(server, options.port);
    },
    async stop(): Promise<void> {
      await close(server);
    },
  };
}
