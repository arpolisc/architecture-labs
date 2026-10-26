import { DispatchQueueRepository } from '../../domain/repositories/DispatchQueueRepository';
import { DispatchRequestDto, toDispatchRequestDto } from '../dto/Dtos';

/** Черга диспетчера: підтверджені замовлення, що очікують кур’єра. */
export class ListWaitingRequests {
  constructor(private readonly queue: DispatchQueueRepository) {}

  async execute(): Promise<DispatchRequestDto[]> {
    return (await this.queue.findWaiting()).map(toDispatchRequestDto);
  }
}
