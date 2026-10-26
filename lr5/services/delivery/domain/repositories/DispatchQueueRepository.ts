import { DispatchRequest } from '../entities/DispatchRequest';

export interface DispatchQueueRepository {
  findByOrderId(orderId: string): Promise<DispatchRequest | null>;
  findWaiting(): Promise<DispatchRequest[]>;
  save(request: DispatchRequest): Promise<void>;
}
