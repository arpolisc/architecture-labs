import { CacheStats, RestaurantCache } from '../application/ports/RestaurantCache';
import { RestaurantDirectory, RestaurantInfo } from '../application/ports/RestaurantDirectory';

interface Entry {
  value: RestaurantInfo;
  expiresAt: number;
}

/**
 * Кеш застосунку для найчастішого сценарію читання: інформація про ресторан під час створення замовлення.
 *   Що кешується:        відповідь сервісу ресторанів {id, name, acceptingOrders}
 *   Ключ:                restaurantId
 *   Час життя:           ttlMs (запасна межа застарілості, якщо подію втрачено)
 *   Інвалідизація:       подія restaurant.availability-changed → invalidate(restaurantId)
 *   Поведінка при промаху: синхронний виклик сервісу ресторанів і запис результату в кеш
 * Не кешуються: відсутній ресторан (щоб новий ресторан став видимим одразу) та помилки зв’язку.
 * ttlMs ≤ 0 вимикає кеш (використовується для вимірювання «до»).
 */
export class CachingRestaurantDirectory implements RestaurantDirectory, RestaurantCache {
  private readonly entries = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly inner: RestaurantDirectory,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async find(restaurantId: string): Promise<RestaurantInfo | null> {
    const cached = this.entries.get(restaurantId);
    if (cached && cached.expiresAt > this.now()) {
      this.hits += 1;
      return cached.value;
    }
    this.misses += 1;
    const value = await this.inner.find(restaurantId);
    if (value && this.ttlMs > 0) {
      this.entries.set(restaurantId, { value, expiresAt: this.now() + this.ttlMs });
    } else {
      this.entries.delete(restaurantId);
    }
    return value;
  }

  invalidate(restaurantId: string): void {
    this.entries.delete(restaurantId);
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: this.entries.size, ttlMs: this.ttlMs };
  }
}
