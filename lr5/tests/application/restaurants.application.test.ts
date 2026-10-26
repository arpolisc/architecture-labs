import { GetRestaurant } from '../../services/restaurants/application/use-cases/GetRestaurant';
import { SetAvailability } from '../../services/restaurants/application/use-cases/SetAvailability';
import { Restaurant } from '../../services/restaurants/domain/entities/Restaurant';
import { InMemoryRestaurantRepository } from '../../services/restaurants/infrastructure/InMemoryRestaurantRepository';
import { ImmediateUnitOfWork } from '../../shared/db/uow';

describe('Сервіс ресторанів: сценарії', () => {
  async function setup() {
    const repo = new InMemoryRestaurantRepository();
    await repo.save(new Restaurant('rest-1', 'Ресторан'));
    const published: { type: string; data: any }[] = [];
    const events = { publish: (type: string, _v: number, data: object) => void published.push({ type, data }) };
    return { get: new GetRestaurant(repo), set: new SetAvailability(repo, events, new ImmediateUnitOfWork()), published };
  }

  test('призупинення й відновлення змінюють acceptingOrders та ідемпотентні', async () => {
    const s = await setup();
    expect((await s.set.execute('rest-1', false)).acceptingOrders).toBe(false);
    expect((await s.set.execute('rest-1', false)).acceptingOrders).toBe(false);
    expect((await s.get.execute('rest-1')).acceptingOrders).toBe(false);
    expect((await s.set.execute('rest-1', true)).acceptingOrders).toBe(true);
  });

  test('подія restaurant.availability-changed публікується лише при реальній зміні стану', async () => {
    const s = await setup();
    await s.set.execute('rest-1', false);
    await s.set.execute('rest-1', false);
    await s.set.execute('rest-1', true);
    expect(s.published.map((e) => e.data.acceptingOrders)).toEqual([false, true]);
    expect(s.published[0]).toEqual({ type: 'restaurant.availability-changed', data: { restaurantId: 'rest-1', acceptingOrders: false } });
  });

  test('невідомий ресторан — RESTAURANT_NOT_FOUND', async () => {
    const s = await setup();
    await expect(s.get.execute('x')).rejects.toMatchObject({ code: 'RESTAURANT_NOT_FOUND' });
  });
});
