import { Restaurant } from '../../services/restaurants/domain/entities/Restaurant';

describe('Сервіс ресторанів: доменні правила Restaurant', () => {
  test('призупинений ресторан відхиляє замовлення, відновлений — приймає', () => {
    const r = new Restaurant('r1', 'Ресторан');
    r.stopAcceptingOrders();
    expect(r.isAcceptingOrders).toBe(false);
    expect(() => r.ensureCanAcceptOrder()).toThrow('не приймає');
    r.resumeAcceptingOrders();
    expect(() => r.ensureCanAcceptOrder()).not.toThrow();
  });

  test('ресторан без назви не створюється', () => {
    expect(() => new Restaurant('r1', ' ')).toThrow('назва');
  });
});
