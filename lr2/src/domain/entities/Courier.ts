/** Кур’єр — працівник, який доставляє замовлення клієнту. */
export class Courier {
  constructor(
    public readonly id: string,
    public readonly name: string,
    private available = true,
  ) {
    if (!id.trim() || !name.trim()) {
      throw new Error('Потрібні ID та ім’я кур’єра');
    }
  }

  get isAvailable(): boolean {
    return this.available;
  }

  /** Перевірка без зміни стану: дозволяє спершу перевірити всі умови, а потім змінювати об’єкти. */
  ensureAvailable(): void {
    if (!this.available) {
      throw new Error('Кур’єр уже зайнятий');
    }
  }

  /** Доменне правило: зайнятого кур’єра не можна призначити повторно. */
  assignToDelivery(): void {
    this.ensureAvailable();
    this.available = false;
  }

  completeDelivery(): void {
    this.available = true;
  }
}
