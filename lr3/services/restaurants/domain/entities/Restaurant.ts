import { DomainError } from '../errors';

/** Ресторан — заклад, який приймає замовлення та готує страви. */
export class Restaurant {
  constructor(
    public readonly id: string,
    public readonly name: string,
    private accepting = true,
  ) {
    if (!id.trim() || !name.trim()) {
      throw new DomainError('Потрібні ID та назва ресторану');
    }
  }

  get isAcceptingOrders(): boolean {
    return this.accepting;
  }

  stopAcceptingOrders(): void {
    this.accepting = false;
  }

  resumeAcceptingOrders(): void {
    this.accepting = true;
  }

  /** Доменне правило: призупинений ресторан не приймає нові замовлення. */
  ensureCanAcceptOrder(): void {
    if (!this.accepting) {
      throw new DomainError('Ресторан тимчасово не приймає замовлення');
    }
  }
}
