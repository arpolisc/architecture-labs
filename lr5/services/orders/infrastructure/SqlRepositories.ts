import { Customer } from '../domain/entities/Customer';
import { Order, OrderStatus } from '../domain/entities/Order';
import { CustomerRepository } from '../domain/repositories/CustomerRepository';
import { OrderRepository } from '../domain/repositories/OrderRepository';
import { SqlDatabase } from '../../../shared/db/sqlite';

interface OrderRow {
  id: string;
  customer_id: string;
  restaurant_id: string;
  delivery_address: string;
  status: string;
  courier_id: string | null;
}

/** Репозиторій замовлень у власній базі даних сервісу. Працює зі схемою після міграції 004. */
export class SqlOrderRepository implements OrderRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findById(id: string): Promise<Order | null> {
    const row = this.db.get<OrderRow>(
      'SELECT id, customer_id, restaurant_id, delivery_address, status, courier_id FROM orders WHERE id = ?',
      [id],
    );
    if (!row) return null;
    const items = this.db
      .all<{ item: string }>('SELECT item FROM order_items WHERE order_id = ? ORDER BY position', [id])
      .map((r) => r.item);
    return Order.restore({
      id: row.id,
      customerId: row.customer_id,
      restaurantId: row.restaurant_id,
      deliveryAddress: row.delivery_address,
      items,
      status: row.status as OrderStatus,
      courierId: row.courier_id,
    });
  }

  async save(order: Order): Promise<void> {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO orders (id, customer_id, restaurant_id, delivery_address, status, courier_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, courier_id = excluded.courier_id`,
        [order.id, order.customerId, order.restaurantId, order.deliveryAddress, order.status, order.courierId],
      );
      this.db.run('DELETE FROM order_items WHERE order_id = ?', [order.id]);
      order.items.forEach((item, position) =>
        this.db.run('INSERT INTO order_items (order_id, position, item) VALUES (?, ?, ?)', [order.id, position, item]),
      );
    });
  }
}

export class SqlCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findById(id: string): Promise<Customer | null> {
    const row = this.db.get<{ id: string; name: string; phone: string }>(
      'SELECT id, name, phone FROM customers WHERE id = ?',
      [id],
    );
    return row ? new Customer(row.id, row.name, row.phone) : null;
  }

  async save(customer: Customer): Promise<void> {
    this.db.transaction(() =>
      this.db.run(
        `INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, phone = excluded.phone`,
        [customer.id, customer.name, customer.phone],
      ),
    );
  }
}
