import { Courier } from '../../domain/entities/Courier';
import { CourierRepository } from '../../domain/repositories/CourierRepository';
import { InMemoryRepository } from './InMemoryRepository';

export class InMemoryCourierRepository
  extends InMemoryRepository<Courier>
  implements CourierRepository {}
