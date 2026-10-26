import { CacheStats, RestaurantCache } from '../ports/RestaurantCache';

export class GetCacheStats {
  constructor(private readonly cache: RestaurantCache) {}

  async execute(): Promise<CacheStats> {
    return this.cache.stats();
  }
}
