import { Courier } from '../domain/entities/Courier';
import { Delivery } from '../domain/entities/Delivery';
import { DispatchRequest } from '../domain/entities/DispatchRequest';
import { CourierRepository } from '../domain/repositories/CourierRepository';
import { DeliveryRepository } from '../domain/repositories/DeliveryRepository';
import { DispatchQueueRepository } from '../domain/repositories/DispatchQueueRepository';

/** Власне сховище сервісу доставки (інші сервіси не мають до нього доступу). */
class InMemoryStore<T extends { readonly id: string }> {
  protected readonly items = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async save(entity: T): Promise<void> {
    this.items.set(entity.id, entity);
  }
}

export class InMemoryCourierRepository extends InMemoryStore<Courier> implements CourierRepository {}

export class InMemoryDeliveryRepository extends InMemoryStore<Delivery> implements DeliveryRepository {
  async findByOrderId(orderId: string): Promise<Delivery | null> {
    return [...this.items.values()].find((d) => d.orderId === orderId) ?? null;
  }
}

export class InMemoryDispatchQueueRepository extends InMemoryStore<DispatchRequest> implements DispatchQueueRepository {
  async findByOrderId(orderId: string): Promise<DispatchRequest | null> {
    return this.items.get(orderId) ?? null;
  }

  async findWaiting(): Promise<DispatchRequest[]> {
    return [...this.items.values()].filter((r) => r.isWaiting);
  }
}
