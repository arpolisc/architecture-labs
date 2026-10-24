/** Порушення доменного правила (інваріанта). Не залежить від жодного фреймворку. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
