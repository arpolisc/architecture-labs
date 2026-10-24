import { Order } from '../../domain/entities/Order';
import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { InMemoryRepository } from './InMemoryRepository';

export class InMemoryOrderRepository
  extends InMemoryRepository<Order>
  implements OrderRepository {}
