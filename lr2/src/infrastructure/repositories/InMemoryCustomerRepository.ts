import { Customer } from '../../domain/entities/Customer';
import { CustomerRepository } from '../../domain/repositories/CustomerRepository';
import { InMemoryRepository } from './InMemoryRepository';

export class InMemoryCustomerRepository
  extends InMemoryRepository<Customer>
  implements CustomerRepository {}
