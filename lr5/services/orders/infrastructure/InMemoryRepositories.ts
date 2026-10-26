import { Customer } from '../domain/entities/Customer';
import { Order } from '../domain/entities/Order';
import { CustomerRepository } from '../domain/repositories/CustomerRepository';
import { OrderRepository } from '../domain/repositories/OrderRepository';

/** Власне сховище сервісу замовлень (інші сервіси не мають до нього доступу). */
class InMemoryStore<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async save(entity: T): Promise<void> {
    this.items.set(entity.id, entity);
  }
}

export class InMemoryOrderRepository extends InMemoryStore<Order> implements OrderRepository {}
export class InMemoryCustomerRepository extends InMemoryStore<Customer> implements CustomerRepository {}
