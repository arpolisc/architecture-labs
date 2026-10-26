export interface RestaurantInfo {
  id: string;
  name: string;
  acceptingOrders: boolean;
}

/** Сервіс ресторанів не відповів або відповів помилкою сервера (тайм-аут, мережа, 5xx). */
export class DirectoryUnavailableError extends Error {}

/**
 * Порт синхронного виклику сервісу ресторанів. Реалізація (HTTP + тайм-аут) — в інфраструктурі.
 * Повертає null, якщо ресторан не знайдено.
 */
export interface RestaurantDirectory {
  find(restaurantId: string): Promise<RestaurantInfo | null>;
}
