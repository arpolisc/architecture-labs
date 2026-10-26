import { Restaurant } from '../domain/entities/Restaurant';
import { RestaurantRepository } from '../domain/repositories/RestaurantRepository';
import { SqlDatabase } from '../../../shared/db/sqlite';

/** Власне сховище сервісу ресторанів. */
export class SqlRestaurantRepository implements RestaurantRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findById(id: string): Promise<Restaurant | null> {
    const row = this.db.get<{ id: string; name: string; accepting_orders: number }>(
      'SELECT id, name, accepting_orders FROM restaurants WHERE id = ?',
      [id],
    );
    return row ? new Restaurant(row.id, row.name, row.accepting_orders === 1) : null;
  }

  async save(restaurant: Restaurant): Promise<void> {
    this.db.transaction(() =>
      this.db.run(
        `INSERT INTO restaurants (id, name, accepting_orders) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, accepting_orders = excluded.accepting_orders`,
        [restaurant.id, restaurant.name, restaurant.isAcceptingOrders ? 1 : 0],
      ),
    );
  }
}
