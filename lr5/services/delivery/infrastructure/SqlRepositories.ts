import { Courier } from '../domain/entities/Courier';
import { Delivery, DeliveryStatus } from '../domain/entities/Delivery';
import { DispatchRequest } from '../domain/entities/DispatchRequest';
import { CourierRepository } from '../domain/repositories/CourierRepository';
import { DeliveryRepository } from '../domain/repositories/DeliveryRepository';
import { DispatchQueueRepository } from '../domain/repositories/DispatchQueueRepository';
import { SqlDatabase } from '../../../shared/db/sqlite';

export class SqlCourierRepository implements CourierRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findById(id: string): Promise<Courier | null> {
    const row = this.db.get<{ id: string; name: string; available: number }>(
      'SELECT id, name, available FROM couriers WHERE id = ?',
      [id],
    );
    return row ? new Courier(row.id, row.name, row.available === 1) : null;
  }

  async save(courier: Courier): Promise<void> {
    this.db.transaction(() =>
      this.db.run(
        `INSERT INTO couriers (id, name, available) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, available = excluded.available`,
        [courier.id, courier.name, courier.isAvailable ? 1 : 0],
      ),
    );
  }
}

interface DeliveryRow {
  id: string;
  order_id: string;
  courier_id: string;
  status: string;
}

export class SqlDeliveryRepository implements DeliveryRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findById(id: string): Promise<Delivery | null> {
    return this.toEntity(this.db.get<DeliveryRow>('SELECT id, order_id, courier_id, status FROM deliveries WHERE id = ?', [id]));
  }

  async findByOrderId(orderId: string): Promise<Delivery | null> {
    return this.toEntity(
      this.db.get<DeliveryRow>('SELECT id, order_id, courier_id, status FROM deliveries WHERE order_id = ?', [orderId]),
    );
  }

  async save(delivery: Delivery): Promise<void> {
    this.db.transaction(() =>
      this.db.run(
        `INSERT INTO deliveries (id, order_id, courier_id, status) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status`,
        [delivery.id, delivery.orderId, delivery.courierId, delivery.status],
      ),
    );
  }

  private toEntity(row: DeliveryRow | undefined): Delivery | null {
    return row ? Delivery.restore(row.id, row.order_id, row.courier_id, row.status as DeliveryStatus) : null;
  }
}

interface RequestRow {
  order_id: string;
  restaurant_id: string;
  delivery_address: string;
  waiting: number;
}

/** Локальна копія замовлень, підтверджених у сервісі замовлень. Скопійовані поля не редагуються; змінюється лише власний прапорець waiting. */
export class SqlDispatchQueueRepository implements DispatchQueueRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findByOrderId(orderId: string): Promise<DispatchRequest | null> {
    const row = this.db.get<RequestRow>(
      'SELECT order_id, restaurant_id, delivery_address, waiting FROM dispatch_requests WHERE order_id = ?',
      [orderId],
    );
    return row ? this.toEntity(row) : null;
  }

  async findWaiting(): Promise<DispatchRequest[]> {
    return this.db
      .all<RequestRow>(
        'SELECT order_id, restaurant_id, delivery_address, waiting FROM dispatch_requests WHERE waiting = 1 ORDER BY rowid',
      )
      .map((r) => this.toEntity(r));
  }

  async save(request: DispatchRequest): Promise<void> {
    this.db.transaction(() =>
      this.db.run(
        `INSERT INTO dispatch_requests (order_id, restaurant_id, delivery_address, waiting) VALUES (?, ?, ?, ?)
         ON CONFLICT (order_id) DO UPDATE SET waiting = excluded.waiting`,
        [request.orderId, request.restaurantId, request.deliveryAddress, request.isWaiting ? 1 : 0],
      ),
    );
  }

  private toEntity(r: RequestRow): DispatchRequest {
    return new DispatchRequest(r.order_id, r.restaurant_id, r.delivery_address, r.waiting === 1);
  }
}
