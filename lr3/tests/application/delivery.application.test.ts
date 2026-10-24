import { ListWaitingRequests } from '../../services/delivery/application/use-cases/ListWaitingRequests';
import { RegisterConfirmedOrder } from '../../services/delivery/application/use-cases/RegisterConfirmedOrder';
import { StartDelivery } from '../../services/delivery/application/use-cases/StartDelivery';
import { Courier } from '../../services/delivery/domain/entities/Courier';
import {
  InMemoryCourierRepository, InMemoryDeliveryRepository, InMemoryDispatchQueueRepository,
} from '../../services/delivery/infrastructure/InMemoryRepositories';

async function setup() {
  const queue = new InMemoryDispatchQueueRepository();
  const couriers = new InMemoryCourierRepository();
  const deliveries = new InMemoryDeliveryRepository();
  await couriers.save(new Courier('courier-1', 'Олена'));
  await couriers.save(new Courier('courier-2', 'Петро'));
  const published: { type: string; data: any }[] = [];
  const events = { publish: (type: string, _v: number, data: object) => void published.push({ type, data }) };
  return {
    queue, couriers, published,
    register: new RegisterConfirmedOrder(queue),
    list: new ListWaitingRequests(queue),
    start: new StartDelivery(queue, couriers, deliveries, events),
  };
}
const order = (id: string) => ({ orderId: id, restaurantId: 'rest-1', deliveryAddress: 'Київ' });

describe('Сервіс доставки: сценарії', () => {
  test('RegisterConfirmedOrder додає замовлення в чергу й ідемпотентний', async () => {
    const s = await setup();
    await s.register.execute(order('o1'));
    await s.register.execute(order('o1'));
    expect(await s.list.execute()).toHaveLength(1);
  });

  test('StartDelivery створює доставку, бере запит із черги й публікує delivery.started', async () => {
    const s = await setup();
    await s.register.execute(order('o1'));
    const result = await s.start.execute('o1', 'courier-1');
    expect(result.created).toBe(true);
    expect(result.delivery.status).toBe('IN_PROGRESS');
    expect(await s.list.execute()).toHaveLength(0);
    expect(s.published).toEqual([{ type: 'delivery.started', data: { deliveryId: 'delivery-o1', orderId: 'o1', courierId: 'courier-1' } }]);
  });

  test('StartDelivery ідемпотентний за orderId; інший кур’єр — DELIVERY_ALREADY_ASSIGNED', async () => {
    const s = await setup();
    await s.register.execute(order('o1'));
    await s.start.execute('o1', 'courier-1');
    const again = await s.start.execute('o1', 'courier-1');
    expect(again.created).toBe(false);
    expect(s.published).toHaveLength(1);
    await expect(s.start.execute('o1', 'courier-2')).rejects.toMatchObject({ code: 'DELIVERY_ALREADY_ASSIGNED' });
  });

  test('StartDelivery: замовлення не в черзі й невідомий кур’єр', async () => {
    const s = await setup();
    await expect(s.start.execute('nope', 'courier-1')).rejects.toMatchObject({ code: 'ORDER_NOT_AWAITING_DELIVERY' });
    await s.register.execute(order('o1'));
    await expect(s.start.execute('o1', 'ghost')).rejects.toMatchObject({ code: 'COURIER_NOT_FOUND' });
  });

  test('зайнятий кур’єр не береться вдруге, запит лишається в черзі (перевірки до змін)', async () => {
    const s = await setup();
    await s.register.execute(order('o1'));
    await s.register.execute(order('o2'));
    await s.start.execute('o1', 'courier-1');
    await expect(s.start.execute('o2', 'courier-1')).rejects.toThrow('зайнятий');
    expect((await s.list.execute()).map((r) => r.orderId)).toEqual(['o2']);
    await expect(s.start.execute('o2', 'courier-2')).resolves.toBeDefined();
  });
});
