import { Customer } from '../../services/orders/domain/entities/Customer';
import { Order } from '../../services/orders/domain/entities/Order';

const newOrder = () => Order.create('o1', 'c1', 'r1', 'Київ, Хрещатик, 10', ['Піца']);

describe('Сервіс замовлень: доменні правила Order і Customer (без БД)', () => {
  test('не створюється з порожнім списком позицій', () => {
    expect(() => Order.create('o1', 'c1', 'r1', 'Київ', [])).toThrow('щонайменше одну позицію');
  });

  test('не створюється з порожньою адресою', () => {
    expect(() => Order.create('o1', 'c1', 'r1', '  ', ['Піца'])).toThrow('Адреса');
  });

  test('проходить життєвий цикл NEW → CONFIRMED → IN_DELIVERY → DELIVERED', () => {
    const o = newOrder();
    o.confirm();
    o.assignCourier('courier-1');
    o.startDelivery();
    expect(o.status).toBe('IN_DELIVERY');
    o.markDelivered();
    expect(o.status).toBe('DELIVERED');
  });

  test('підтвердити можна лише нове замовлення', () => {
    const o = newOrder();
    o.confirm();
    expect(() => o.confirm()).toThrow('лише нове');
  });

  test('не призначає кур’єра непідтвердженому замовленню', () => {
    expect(() => newOrder().assignCourier('courier-1')).toThrow('підтвердженому');
  });

  test('не починає доставку без кур’єра', () => {
    const o = newOrder();
    o.confirm();
    expect(() => o.startDelivery()).toThrow('призначити кур’єра');
  });

  test('скасування заборонене після початку доставки', () => {
    const o = newOrder();
    o.confirm();
    o.assignCourier('courier-1');
    o.startDelivery();
    expect(() => o.cancel()).toThrow('скасувати не можна');
  });

  test('нове замовлення можна скасувати, повторно — ні', () => {
    const o = newOrder();
    o.cancel();
    expect(o.status).toBe('CANCELLED');
    expect(() => o.cancel()).toThrow('вже скасоване');
  });

  test('клієнт без телефону не створюється', () => {
    expect(() => new Customer('u1', 'Ірина', ' ')).toThrow('телефон');
  });
});
