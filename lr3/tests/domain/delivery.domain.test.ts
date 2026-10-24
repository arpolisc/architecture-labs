import { Courier } from '../../services/delivery/domain/entities/Courier';
import { Delivery } from '../../services/delivery/domain/entities/Delivery';
import { DispatchRequest } from '../../services/delivery/domain/entities/DispatchRequest';

describe('Сервіс доставки: доменні правила Courier, Delivery, DispatchRequest', () => {
  test('зайнятого кур’єра не можна призначити повторно', () => {
    const c = new Courier('c1', 'Олена');
    c.assignToDelivery();
    expect(c.isAvailable).toBe(false);
    expect(() => c.assignToDelivery()).toThrow('зайнятий');
  });

  test('ensureAvailable не змінює стан кур’єра', () => {
    const c = new Courier('c1', 'Олена');
    c.ensureAvailable();
    expect(c.isAvailable).toBe(true);
  });

  test('кур’єр знову доступний після завершення доставки', () => {
    const c = new Courier('c1', 'Олена');
    c.assignToDelivery();
    c.completeDelivery();
    expect(c.isAvailable).toBe(true);
  });

  test('доставка: ASSIGNED → IN_PROGRESS → COMPLETED, пропуск стану заборонений', () => {
    const d = new Delivery('d1', 'o1', 'c1');
    expect(() => d.complete()).toThrow('розпочату');
    d.start();
    expect(() => d.start()).toThrow('призначену');
    d.complete();
    expect(d.status).toBe('COMPLETED');
  });

  test('запит на доставку можна взяти лише один раз', () => {
    const r = new DispatchRequest('o1', 'r1', 'Київ');
    expect(r.isWaiting).toBe(true);
    r.markTaken();
    expect(r.isWaiting).toBe(false);
    expect(() => r.markTaken()).toThrow('вже взято');
  });
});
