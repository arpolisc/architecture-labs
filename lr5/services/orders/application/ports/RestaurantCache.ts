export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  ttlMs: number;
}

/** Керування кешем інформації про ресторани: інвалідизація за подією та статистика. */
export interface RestaurantCache {
  invalidate(restaurantId: string): void;
  stats(): CacheStats;
}
