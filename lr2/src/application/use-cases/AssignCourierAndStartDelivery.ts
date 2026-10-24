import { Delivery } from '../../domain/entities/Delivery';
import { CourierRepository } from '../../domain/repositories/CourierRepository';
import { DeliveryRepository } from '../../domain/repositories/DeliveryRepository';
import { OrderRepository } from '../../domain/repositories/OrderRepository';
import { OrderDto, toOrderDto } from '../dto/OrderDto';

/**
 * Сценарій 3: призначення кур’єра й початок доставки.
 * Транзакційна межа проходить навколо всього методу execute: спершу перевіряються
 * всі умови, і лише потім змінюються об’єкти та виконується збереження.
 */
export class AssignCourierAndStartDelivery {
  constructor(
    private readonly orders: OrderRepository,
    private readonly couriers: CourierRepository,
    private readonly deliveries: DeliveryRepository,
  ) {}

  async execute(orderId: string, courierId: string): Promise<OrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error('Замовлення не знайдено');
    const courier = await this.couriers.findById(courierId);
    if (!courier) throw new Error('Кур’єра не знайдено');

    // Спершу перевірки: у разі відмови жоден об’єкт не змінюється.
    courier.ensureAvailable();
    order.assignCourier(courier.id); // помилка, якщо не CONFIRMED
    order.startDelivery();
    courier.assignToDelivery();

    const delivery = new Delivery(`delivery-${order.id}`, order.id, courier.id);
    delivery.start();

    await this.orders.save(order);
    await this.couriers.save(courier);
    await this.deliveries.save(delivery);
    return toOrderDto(order);
  }
}
