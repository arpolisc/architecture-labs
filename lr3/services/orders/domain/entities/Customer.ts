import { DomainError } from '../errors';

/** Клієнт — користувач, який створює замовлення. */
export class Customer {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly phone: string,
  ) {
    if (!id.trim() || !name.trim() || !phone.trim()) {
      throw new DomainError('Клієнт повинен мати ID, ім’я та телефон');
    }
  }
}
