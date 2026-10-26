import { GetRestaurant } from '../application/use-cases/GetRestaurant';
import { SetAvailability } from '../application/use-cases/SetAvailability';
import { Router } from '../../../shared/http/router';

export interface RestaurantsUseCases {
  getRestaurant: GetRestaurant;
  setAvailability: SetAvailability;
}

export interface RestaurantsRouterOptions {
  /** Штучна затримка читання: імітує мережеву або дискову затримку реального сервісу (для вимірювань кешу). */
  simulatedLatencyMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildRouter(uc: RestaurantsUseCases, options: RestaurantsRouterOptions = {}): Router {
  const router = new Router();
  router.add('GET', '/health', async () => ({ status: 200, body: { service: 'restaurants', status: 'ok' } }));
  router.add('GET', '/restaurants/:id', async (ctx) => {
    if (options.simulatedLatencyMs) await sleep(options.simulatedLatencyMs);
    return { status: 200, body: await uc.getRestaurant.execute(ctx.params.id) };
  });
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
