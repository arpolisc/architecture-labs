/** Кордон локальної транзакції: зміна даних і запис події фіксуються разом. */
export interface UnitOfWork {
  run<T>(fn: () => Promise<T>): Promise<T>;
}
