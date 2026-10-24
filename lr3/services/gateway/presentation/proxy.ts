import { requestJson, UpstreamTimeoutError, UpstreamUnavailableError } from '../../../shared/http/client';
import { errorResult } from '../../../shared/http/errors';
import { RouteContext, RouteResult, Router } from '../../../shared/http/router';

export interface Upstream {
  /** Публічний префікс, наприклад /api/orders */
  prefix: string;
  /** Внутрішня адреса сервісу */
  baseUrl: string;
  /** Внутрішній префікс, наприклад /orders */
  internalPrefix: string;
  name: string;
}

const FORWARDED_HEADERS = ['idempotency-key', 'x-request-id'];

async function forward(upstream: Upstream, ctx: RouteContext, timeoutMs: number): Promise<RouteResult> {
  const rest = ctx.path.slice(upstream.prefix.length);
  const query = ctx.query.toString();
  const url = `${upstream.baseUrl}${upstream.internalPrefix}${rest}${query ? `?${query}` : ''}`;
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = ctx.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  try {
    const response = await requestJson(url, {
      method: ctx.method,
      body: typeof ctx.body === 'object' ? ctx.body : undefined,
      headers,
      timeoutMs,
    });
    return { status: response.status, body: response.body };
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) {
      return errorResult(504, 'UPSTREAM_TIMEOUT', `Сервіс «${upstream.name}» не відповів вчасно`);
    }
    if (error instanceof UpstreamUnavailableError) {
      return errorResult(503, 'SERVICE_UNAVAILABLE', `Сервіс «${upstream.name}» тимчасово недоступний`, { 'Retry-After': '5' });
    }
    throw error;
  }
}

/** Шлюз: єдина точка входу, прозоре проксіювання публічних маршрутів /api/*. Маршрути /internal/* не публікуються. */
export function buildGatewayRouter(upstreams: Upstream[], timeoutMs: number): Router {
  const router = new Router();

  router.add('GET', '/health', async () => ({ status: 200, body: { service: 'gateway', status: 'ok' } }));

  router.add('GET', '/api/health', async () => {
    const checks = await Promise.all(
      upstreams.map(async (u) => {
        try {
          const r = await requestJson(`${u.baseUrl}/health`, { timeoutMs: 500 });
          return [u.name, r.status === 200 ? 'ok' : 'degraded'] as const;
        } catch {
          return [u.name, 'unavailable'] as const;
        }
      }),
    );
    const services = Object.fromEntries(checks);
    const allOk = checks.every(([, s]) => s === 'ok');
    return { status: allOk ? 200 : 503, body: { gateway: 'ok', services } };
  });

  for (const upstream of upstreams) {
    router.addPrefix('*', upstream.prefix, (ctx) => forward(upstream, ctx, timeoutMs));
  }
  return router;
}
