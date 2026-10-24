import { Delivery } from '../../domain/entities/Delivery';
import { DeliveryRepository } from '../../domain/repositories/DeliveryRepository';
import { InMemoryRepository } from './InMemoryRepository';

export class InMemoryDeliveryRepository
  extends InMemoryRepository<Delivery>
  implements DeliveryRepository {}
