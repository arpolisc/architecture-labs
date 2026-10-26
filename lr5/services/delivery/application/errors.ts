export type ErrorKind = 'not_found' | 'conflict' | 'unprocessable' | 'unavailable' | 'invalid';

/** Помилка сценарію використання з машинним кодом (див. розділ «Помилки» контракту). */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly kind: ErrorKind,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
