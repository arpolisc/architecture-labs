import { createContainer } from '../src/config/container';

const command = {
  id: 'o1',
  customerId: 'cust-1',
  restaurantId: 'rest-1',
  deliveryAddress: 'Київ, Хрещатик, 10',
  items: ['Борщ'],
};

describe('Сценарії використання (репозиторії в пам’яті, без БД)', () => {
  test('CreateOrder створює замовлення у статусі NEW', async () => {
    const app = await createContainer();
    const dto = await app.createOrder.execute(command);
    expect(dto.status).toBe('NEW');
    expect(dto.customerId).toBe('cust-1');
  });

  test('CreateOrder відхиляє невідомого клієнта, ресторан і дубль ID', async () => {
    const app = await createContainer();
    await expect(app.createOrder.execute({ ...command, customerId: 'x' })).rejects.toThrow('Клієнта не знайдено');
    await expect(app.createOrder.execute({ ...command, restaurantId: 'x' })).rejects.toThrow('Ресторан не знайдено');
    await app.createOrder.execute(command);
    await expect(app.createOrder.execute(command)).rejects.toThrow('вже існує');
  });

  test('ConfirmOrder підтверджує замовлення, повторне підтвердження відхиляється', async () => {
    const app = await createContainer();
    await app.createOrder.execute(command);
    expect((await app.confirmOrder.execute('o1')).status).toBe('CONFIRMED');
    await expect(app.confirmOrder.execute('o1')).rejects.toThrow('лише нове');
  });

  test('AssignCourierAndStartDelivery переводить замовлення в IN_DELIVERY', async () => {
    const app = await createContainer();
    await app.createOrder.execute(command);
    await app.confirmOrder.execute('o1');
    const dto = await app.assignCourierAndStartDelivery.execute('o1', 'courier-1');
    expect(dto.status).toBe('IN_DELIVERY');
    expect(dto.courierId).toBe('courier-1');
  });

  test('відмова для непідтвердженого замовлення не залишає кур’єра зайнятим', async () => {
    const app = await createContainer();
    await app.createOrder.execute(command);
    await expect(app.assignCourierAndStartDelivery.execute('o1', 'courier-1')).rejects.toThrow('підтвердженому');

    // кур’єр має лишитися вільним: після підтвердження призначення проходить
    await app.confirmOrder.execute('o1');
    await expect(app.assignCourierAndStartDelivery.execute('o1', 'courier-1')).resolves.toBeDefined();
  });

  test('зайнятий кур’єр не призначається на друге замовлення, друге замовлення не змінюється', async () => {
    const app = await createContainer();
    for (const id of ['o1', 'o2']) {
      await app.createOrder.execute({ ...command, id });
      await app.confirmOrder.execute(id);
    }
    await app.assignCourierAndStartDelivery.execute('o1', 'courier-1');
    await expect(app.assignCourierAndStartDelivery.execute('o2', 'courier-1')).rejects.toThrow('зайнятий');
    // o2 так і лишилося підтвердженим без кур’єра
    await expect(app.confirmOrder.execute('o2')).rejects.toThrow('лише нове');
  });
});
