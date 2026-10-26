import { AppError } from '../application/errors';
import { DomainError } from '../domain/errors';
import { errorResult, KIND_TO_STATUS } from '../../../shared/http/errors';
import { RouteResult } from '../../../shared/http/router';

/** Перетворення помилок сценаріїв і домену на HTTP-відповіді за контрактом. */
export function mapError(error: unknown): RouteResult {
  if (error instanceof AppError) {
    const headers = error.kind === 'unavailable' ? { 'Retry-After': '5' } : undefined;
    return errorResult(KIND_TO_STATUS[error.kind] ?? 500, error.code, error.message, headers);
  }
  if (error instanceof DomainError) {
    return errorResult(422, 'RULE_VIOLATION', error.message);
  }
  console.error('Непередбачена помилка:', error);
  return errorResult(500, 'INTERNAL_ERROR', 'Внутрішня помилка сервісу');
}
