import { AsyncLocalStorage } from 'node:async_hooks';
import { SqlDatabase } from './sqlite';

/** Кордон локальної транзакції сервісу: усі зміни сутностей і запис події в outbox фіксуються разом або не фіксуються взагалі. */
export interface Transactional {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Одиниця роботи над однією базою даних. Транзакції виконуються послідовно (одне з’єднання);
 * вкладений виклик приєднується до зовнішньої транзакції.
 * Усередині fn не можна чекати зовнішнього введення-виведення (мережі): транзакція має бути короткою.
 */
export class SqlUnitOfWork implements Transactional {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly context = new AsyncLocalStorage<boolean>();

  constructor(private readonly db: SqlDatabase) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    const execute = async (): Promise<T> => {
      this.db.begin();
      try {
        const result = await this.context.run(true, fn);
        this.db.commit();
        return result;
      } catch (error) {
        this.db.rollback();
        throw error;
      }
    };
    const result = this.chain.then(execute, execute);
    this.chain = result.catch(() => undefined);
    return result;
  }
}

/** Реалізація без бази даних для модульних тестів сценаріїв. */
export class ImmediateUnitOfWork implements Transactional {
  run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
