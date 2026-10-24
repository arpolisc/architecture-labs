import type { OrderDto } from '../application/dto/OrderDto';

/** Що шар подання очікує від застосунку: лише сценарії (структурна типізація, без імпорту config). */
export interface CliApp {
  createOrder: {
    execute(command: {
      id: string;
      customerId: string;
      restaurantId: string;
      deliveryAddress: string;
      items: string[];
    }): Promise<OrderDto>;
  };
  confirmOrder: { execute(orderId: string): Promise<OrderDto> };
  assignCourierAndStartDelivery: { execute(orderId: string, courierId: string): Promise<OrderDto> };
}

/** Мінімальний шар подання: викликає сценарії та форматує відповідь. Бізнес-правил тут немає. */
export async function runDemo(app: CliApp): Promise<void> {
  console.log('=== Система обліку замовлень служби доставки їжі ===');

  const created = await app.createOrder.execute({
    id: 'order-1001',
    customerId: 'cust-1',
    restaurantId: 'rest-1',
    deliveryAddress: 'Київ, вул. Хрещатик, 10',
    items: ['Борщ', 'Вареники'],
  });
  console.log('1. Створено:', created.id, created.status);

  const confirmed = await app.confirmOrder.execute(created.id);
  console.log('2. Підтверджено:', confirmed.status);

  const inDelivery = await app.assignCourierAndStartDelivery.execute(created.id, 'courier-1');
  console.log('3. Кур’єра призначено:', inDelivery.status, inDelivery.courierId);
}
