/** Сховище в пам’яті. У ЛР5 буде замінене адаптерами до реальної СУБД. */
export class InMemoryRepository<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async save(entity: T): Promise<void> {
    this.items.set(entity.id, entity);
  }

  async findAll(): Promise<T[]> {
    return [...this.items.values()];
  }
}
