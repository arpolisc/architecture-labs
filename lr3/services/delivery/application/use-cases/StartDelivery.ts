import { Delivery } from '../../domain/entities/Delivery';
import { CourierRepository } from '../../domain/repositories/CourierRepository';
import { DeliveryRepository } from '../../domain/repositories/DeliveryRepository';
import { DispatchQueueRepository } from '../../domain/repositories/DispatchQueueRepository';
import { DeliveryDto, toDeliveryDto } from '../dto/Dtos';
import { AppError } from '../errors';
import { EventPublisher } from '../ports/EventPublisher';

export interface StartDeliveryResult {
  delivery: DeliveryDto;
  /** false — повторний запит для того самого замовлення й кур’єра (ідемпотентність). */
  created: boolean;
}

/**
 * Сценарій: призначення кур’єра й початок доставки (колишній сценарій 3 з ЛР2).
 * Доменні правила Courier та Delivery перенесено без змін. Статус замовлення змінює сервіс
 * замовлень після отримання події delivery.started; сервіс доставки не звертається до чужих даних.
 */
export class StartDelivery {
  constructor(
    private readonly queue: DispatchQueueRepository,
    private readonly couriers: CourierRepository,
    private readonly deliveries: DeliveryRepository,
    private readonly events: EventPublisher,
  ) {}

  async execute(orderId: string, courierId: string): Promise<StartDeliveryResult> {
    const existing = await this.deliveries.findByOrderId(orderId);
    if (existing) {
      if (existing.courierId !== courierId) {
        throw new AppError('DELIVERY_ALREADY_ASSIGNED', 'Для замовлення вже призначено іншого кур’єра', 'conflict');
      }
      return { delivery: toDeliveryDto(existing), created: false };
    }

    const request = await this.queue.findByOrderId(orderId);
    if (!request) {
      throw new AppError('ORDER_NOT_AWAITING_DELIVERY', 'Замовлення невідоме або ще не підтверджене рестораном', 'not_found');
    }
    const courier = await this.couriers.findById(courierId);
    if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Кур’єра не знайдено', 'not_found');

    // Спершу перевірки без зміни стану, потім зміни та збереження.
    courier.ensureAvailable();
    request.ensureWaiting();
    courier.assignToDelivery();
    request.markTaken();
    const delivery = new Delivery(`delivery-${orderId}`, orderId, courier.id);
    delivery.start();

    await this.couriers.save(courier);
    await this.queue.save(request);
    await this.deliveries.save(delivery);
    this.events.publish('delivery.started', 1, {
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      courierId: delivery.courierId,
    });
    return { delivery: toDeliveryDto(delivery), created: true };
  }
}
