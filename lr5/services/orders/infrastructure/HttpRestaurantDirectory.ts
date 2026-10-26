import { RestaurantDirectory, RestaurantInfo, DirectoryUnavailableError } from '../application/ports/RestaurantDirectory';
import { requestJson, UpstreamTimeoutError, UpstreamUnavailableError } from '../../../shared/http/client';

/** Синхронний HTTP-виклик сервісу ресторанів із тайм-аутом (контракт: contracts/openapi/restaurants.yaml). */
export class HttpRestaurantDirectory implements RestaurantDirectory {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async find(restaurantId: string): Promise<RestaurantInfo | null> {
    try {
      const response = await requestJson(`${this.baseUrl}/restaurants/${encodeURIComponent(restaurantId)}`, {
        timeoutMs: this.timeoutMs,
      });
      if (response.status === 404) return null;
      if (response.status !== 200) {
        throw new DirectoryUnavailableError(`Сервіс ресторанів повернув статус ${response.status}`);
      }
      const { id, name, acceptingOrders } = response.body ?? {};
      return { id, name, acceptingOrders: acceptingOrders === true };
    } catch (error) {
      if (error instanceof UpstreamTimeoutError || error instanceof UpstreamUnavailableError) {
        throw new DirectoryUnavailableError(error.message);
      }
      throw error;
    }
  }
}
