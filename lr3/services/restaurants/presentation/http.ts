import { GetRestaurant } from '../application/use-cases/GetRestaurant';
import { SetAvailability } from '../application/use-cases/SetAvailability';
import { Router } from '../../../shared/http/router';

export interface RestaurantsUseCases {
  getRestaurant: GetRestaurant;
  setAvailability: SetAvailability;
}

export function buildRouter(uc: RestaurantsUseCases): Router {
  const router = new Router();
  router.add('GET', '/health', async () => ({ status: 200, body: { service: 'restaurants', status: 'ok' } }));
  router.add('GET', '/restaurants/:id', async (ctx) => ({ status: 200, body: await uc.getRestaurant.execute(ctx.params.id) }));
  router.add('POST', '/restaurants/:id/pause', async (ctx) => ({
    status: 200,
    body: await uc.setAvailability.execute(ctx.params.id, false),
  }));
  router.add('POST', '/restaurants/:id/resume', async (ctx) => ({
    status: 200,
    body: await uc.setAvailability.execute(ctx.params.id, true),
  }));
  return router;
}
