import { RouteResult } from './router';

export function errorResult(status: number, code: string, message: string, headers?: Record<string, string>): RouteResult {
  return { status, body: { error: { code, message } }, headers };
}

export const KIND_TO_STATUS: Record<string, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  unavailable: 503,
};
