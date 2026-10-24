import { ConfirmOrder } from '../../services/orders/application/use-cases/ConfirmOrder';
import { CreateOrder } from '../../services/orders/application/use-cases/CreateOrder';
import { HandleDeliveryStarted } from '../../services/orders/application/use-cases/HandleDeliveryStarted';
import { DirectoryUnavailableError, RestaurantDirectory } from '../../services/orders/application/ports/RestaurantDirectory';
import { Customer } from '../../services/orders/domain/entities/Customer';
import { InMemoryCustomerRepository, InMemoryOrderRepository } from '../../services/orders/infrastructure/InMemoryRepositories';

class FakeDirectory implements RestaurantDirectory {
  calls = 0;
  constructor(public mode: 'ok' | 'paused' | 'missing' | 'down' = 'ok') {}
  async find(id: string) {
    this.calls += 1;
    if (this.mode === 'down') throw new DirectoryUnavailableError('недоступний');
    if (this.mode === 'missing') return null;
    return { id, name: 'Ресторан', acceptingOrders: this.mode === 'ok' };
  }
}

const command = { id: 'o1', customerId: 'cust-1', restaurantId: 'rest-1', deliveryAddress: 'Київ, Хрещатик, 10', items: ['Борщ'] };

async function setup(mode: 'ok' | 'paused' | 'missing' | 'down' = 'ok') {
  const orders = new InMemoryOrderRepository();
  const customers = new InMemoryCustomerRepository();
  await customers.save(new Customer('cust-1', 'Ірина', '+380501112233'));
  const directory = new FakeDirectory(mode);
  const published: { type: string; version: number; data: any }[] = [];
  const events = { publish: (type: string, version: number, data: object) => void published.push({ type, version, data }) };
  return {
    orders, directory, published,
    createOrder: new CreateOrder(orders, customers, directory),
    confirmOrder: new ConfirmOrder(orders, events),
    handleDeliveryStarted: new HandleDeliveryStarted(orders),
  };
}

describe('Сервіс замовлень: сценарії', () => {
  test('CreateOrder створює замовлення у статусі NEW', async () => {
    const s = await setup();
    const result = await s.createOrder.execute(command);
    expect(result.created).toBe(true);
    expect(result.order.status).toBe('NEW');
  });

  test('CreateOrder ідемпотентний за ID: повтор повертає наявне замовлення', async () => {
    const s = await setup();
    await s.createOrder.execute(command);
    const again = await s.createOrder.execute(command);
    expect(again.created).toBe(false);
    expect(s.directory.calls).toBe(1);
  });

  test('CreateOrder: той самий ID з іншими даними — ORDER_ID_CONFLICT', async () => {
    const s = await setup();
    await s.createOrder.execute(command);
    await expect(s.createOrder.execute({ ...command, items: ['Вареники'] })).rejects.toMatchObject({ code: 'ORDER_ID_CONFLICT' });
  });

  test('CreateOrder: невідомий клієнт, ресторан, призупинений ресторан', async () => {
    await expect((await setup()).createOrder.execute({ ...command, customerId: 'x' })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    await expect((await setup('missing')).createOrder.execute(command)).rejects.toMatchObject({ code: 'RESTAURANT_NOT_FOUND' });
    await expect((await setup('paused')).createOrder.execute(command)).rejects.toMatchObject({ code: 'RESTAURANT_NOT_ACCEPTING' });
  });

  test('CreateOrder: недоступний сервіс ресторанів — DEPENDENCY_UNAVAILABLE, замовлення не збережено', async () => {
    const s = await setup('down');
    await expect(s.createOrder.execute(command)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', kind: 'unavailable' });
    expect(await s.orders.findById('o1')).toBeNull();
  });

  test('ConfirmOrder публікує одну подію order.confirmed v1 з потрібними даними', async () => {
    const s = await setup();
    await s.createOrder.execute(command);
    const dto = await s.confirmOrder.execute('o1');
    expect(dto.status).toBe('CONFIRMED');
    expect(s.published).toHaveLength(1);
    expect(s.published[0]).toMatchObject({ type: 'order.confirmed', version: 1, data: { orderId: 'o1', restaurantId: 'rest-1' } });
  });

  test('ConfirmOrder: повторне підтвердження відхиляється й не публікує другу подію', async () => {
    const s = await setup();
    await s.createOrder.execute(command);
    await s.confirmOrder.execute('o1');
    await expect(s.confirmOrder.execute('o1')).rejects.toThrow('лише нове');
    expect(s.published).toHaveLength(1);
  });

  test('HandleDeliveryStarted переводить замовлення в IN_DELIVERY і ідемпотентний', async () => {
    const s = await setup();
    await s.createOrder.execute(command);
    await s.confirmOrder.execute('o1');
    const data = { deliveryId: 'delivery-o1', orderId: 'o1', courierId: 'courier-1' };
    await s.handleDeliveryStarted.execute(data);
    await s.handleDeliveryStarted.execute(data);
    const order = await s.orders.findById('o1');
    expect(order?.status).toBe('IN_DELIVERY');
    expect(order?.courierId).toBe('courier-1');
  });

  test('HandleDeliveryStarted: невідоме замовлення — ORDER_NOT_FOUND', async () => {
    const s = await setup();
    await expect(s.handleDeliveryStarted.execute({ deliveryId: 'd', orderId: 'nope', courierId: 'c' })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
