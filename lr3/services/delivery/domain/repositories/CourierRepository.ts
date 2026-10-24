import { Courier } from '../entities/Courier';

export interface CourierRepository {
  findById(id: string): Promise<Courier | null>;
  save(courier: Courier): Promise<void>;
}
