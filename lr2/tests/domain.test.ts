import { Courier } from '../src/domain/entities/Courier';
import { Customer } from '../src/domain/entities/Customer';
import { Delivery } from '../src/domain/entities/Delivery';
import { Order } from '../src/domain/entities/Order';
import { Restaurant } from '../src/domain/entities/Restaurant';

const newOrder = () => Order.create('o1', 'c1', 'r1', 'Київ, Хрещатик, 10', ['Піца']);

describe('Order: доменні правила без БД', () => {
  test('не створюється з порожнім списком позицій', () => {
    expect(() => Order.create('o1', 'c1', 'r1', 'Київ', [])).toThrow('щонайменше одну позицію');
  });

  test('не створюється з порожньою адресою', () => {
    expect(() => Order.create('o1', 'c1', 'r1', '  ', ['Піца'])).toThrow('Адреса');
  });

  test('проходить дозволений життєвий цикл NEW → CONFIRMED → IN_DELIVERY → DELIVERED', () => {
    const o = newOrder();
    expect(o.status).toBe('NEW');
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
});

describe('Restaurant, Courier, Customer, Delivery', () => {
  test('призупинений ресторан відхиляє замовлення, відновлений — приймає', () => {
    const r = new Restaurant('r1', 'Ресторан');
    r.stopAcceptingOrders();
    expect(() => r.ensureCanAcceptOrder()).toThrow('не приймає');
    r.resumeAcceptingOrders();
    expect(() => r.ensureCanAcceptOrder()).not.toThrow();
  });

  test('зайнятого кур’єра не можна призначити повторно', () => {
    const c = new Courier('c1', 'Олена');
    c.assignToDelivery();
    expect(c.isAvailable).toBe(false);
    expect(() => c.assignToDelivery()).toThrow('зайнятий');
  });

  test('кур’єр знову доступний після завершення доставки', () => {
    const c = new Courier('c1', 'Олена');
    c.assignToDelivery();
    c.completeDelivery();
    expect(c.isAvailable).toBe(true);
  });

  test('клієнт без телефону не створюється', () => {
    expect(() => new Customer('u1', 'Ірина', ' ')).toThrow('телефон');
  });

  test('доставка: ASSIGNED → IN_PROGRESS → COMPLETED, пропуск стану заборонений', () => {
    const d = new Delivery('d1', 'o1', 'c1');
    expect(() => d.complete()).toThrow('розпочату');
    d.start();
    expect(() => d.start()).toThrow('призначену');
    d.complete();
    expect(d.status).toBe('COMPLETED');
  });
});
