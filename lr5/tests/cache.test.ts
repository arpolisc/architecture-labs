import { CachingRestaurantDirectory } from '../services/orders/infrastructure/CachingRestaurantDirectory';
import { InvalidateRestaurantCache } from '../services/orders/application/use-cases/InvalidateRestaurantCache';
import { DirectoryUnavailableError, RestaurantDirectory, RestaurantInfo } from '../services/orders/application/ports/RestaurantDirectory';

class CountingDirectory implements RestaurantDirectory {
  calls = 0;
  mode: 'ok' | 'missing' | 'down' = 'ok';
  accepting = true;
  async find(id: string): Promise<RestaurantInfo | null> {
    this.calls += 1;
    if (this.mode === 'down') throw new DirectoryUnavailableError('недоступний');
    if (this.mode === 'missing') return null;
    return { id, name: 'Ресторан', acceptingOrders: this.accepting };
  }
}

function setup(ttlMs = 1000) {
  const inner = new CountingDirectory();
  let now = 1_000_000;
  const cache = new CachingRestaurantDirectory(inner, ttlMs, () => now);
  return { inner, cache, advance: (ms: number) => (now += ms) };
}

describe('Кеш інформації про ресторани: ключ, час життя, інвалідизація, поведінка при промаху', () => {
  test('перший запит — промах (звернення до сервісу), повторний — влучання без звернення', async () => {
    const { inner, cache } = setup();
    await cache.find('rest-1');
    await cache.find('rest-1');
    await cache.find('rest-1');
    expect(inner.calls).toBe(1);
    expect(cache.stats()).toMatchObject({ hits: 2, misses: 1, size: 1 });
  });

  test('ключ — ідентифікатор ресторану: різні ресторани кешуються окремо', async () => {
    const { inner, cache } = setup();
    await cache.find('rest-1');
    await cache.find('rest-2');
    await cache.find('rest-1');
    expect(inner.calls).toBe(2);
    expect(cache.stats().size).toBe(2);
  });

  test('час життя: після спливу запис недійсний і значення береться з сервісу заново', async () => {
    const { inner, cache, advance } = setup(1000);
    await cache.find('rest-1');
    advance(999);
    await cache.find('rest-1');
    expect(inner.calls).toBe(1);
    advance(2);
    inner.accepting = false;
    const fresh = await cache.find('rest-1');
    expect(inner.calls).toBe(2);
    expect(fresh?.acceptingOrders).toBe(false);
  });

  test('інвалідизація за подією: запис вилучається, наступний запит бачить нові дані', async () => {
    const { inner, cache } = setup(60_000);
    await cache.find('rest-1');
    inner.accepting = false;
    expect((await cache.find('rest-1'))?.acceptingOrders).toBe(true); // застаріле значення до події
    await new InvalidateRestaurantCache(cache).execute({ restaurantId: 'rest-1' });
    expect((await cache.find('rest-1'))?.acceptingOrders).toBe(false);
  });

  test('інвалідизація ідемпотентна й не залежить від порядку подій', async () => {
    const { cache } = setup(60_000);
    const uc = new InvalidateRestaurantCache(cache);
    await uc.execute({ restaurantId: 'rest-1' });
    await uc.execute({ restaurantId: 'rest-1' });
    expect(cache.stats().size).toBe(0);
  });

  test('не кешуються відсутній ресторан і помилки зв’язку', async () => {
    const { inner, cache } = setup();
    inner.mode = 'missing';
    expect(await cache.find('x')).toBeNull();
    expect(await cache.find('x')).toBeNull();
    expect(inner.calls).toBe(2);
    inner.mode = 'down';
    await expect(cache.find('x')).rejects.toBeInstanceOf(DirectoryUnavailableError);
    expect(cache.stats().size).toBe(0);
  });

  test('ttl = 0 вимикає кеш (базовий вимір «до»)', async () => {
    const { inner, cache } = setup(0);
    await cache.find('rest-1');
    await cache.find('rest-1');
    expect(inner.calls).toBe(2);
    expect(cache.stats()).toMatchObject({ hits: 0, misses: 2, size: 0 });
  });
});
