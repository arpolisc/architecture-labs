import { GetRestaurant } from '../../services/restaurants/application/use-cases/GetRestaurant';
import { SetAvailability } from '../../services/restaurants/application/use-cases/SetAvailability';
import { Restaurant } from '../../services/restaurants/domain/entities/Restaurant';
import { InMemoryRestaurantRepository } from '../../services/restaurants/infrastructure/InMemoryRestaurantRepository';

describe('Сервіс ресторанів: сценарії', () => {
  async function setup() {
    const repo = new InMemoryRestaurantRepository();
    await repo.save(new Restaurant('rest-1', 'Ресторан'));
    return { get: new GetRestaurant(repo), set: new SetAvailability(repo) };
  }

  test('призупинення й відновлення змінюють acceptingOrders та ідемпотентні', async () => {
    const s = await setup();
    expect((await s.set.execute('rest-1', false)).acceptingOrders).toBe(false);
    expect((await s.set.execute('rest-1', false)).acceptingOrders).toBe(false);
    expect((await s.get.execute('rest-1')).acceptingOrders).toBe(false);
    expect((await s.set.execute('rest-1', true)).acceptingOrders).toBe(true);
  });

  test('невідомий ресторан — RESTAURANT_NOT_FOUND', async () => {
    const s = await setup();
    await expect(s.get.execute('x')).rejects.toMatchObject({ code: 'RESTAURANT_NOT_FOUND' });
  });
});
