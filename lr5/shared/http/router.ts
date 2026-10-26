import * as http from 'node:http';

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: unknown;
  method: string;
  path: string;
}

export interface RouteResult {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type Handler = (ctx: RouteContext) => Promise<RouteResult>;
export type ErrorMapper = (error: unknown) => RouteResult;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

/** Мінімальний маршрутизатор JSON-запитів без зовнішніх залежностей. */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const source = pattern.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  /** Префіксний маршрут (для шлюзу): ловить усі шляхи, що починаються з prefix. */
  addPrefix(method: string, prefix: string, handler: Handler): this {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.routes.push({ method, regex: new RegExp(`^${escaped}(?:/.*)?$`), keys: [], handler });
    return this;
  }

  find(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method && route.method !== '*') continue;
      const match = route.regex.exec(path);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])));
      return { handler: route.handler, params };
    }
    return null;
  }
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return Symbol.for('invalid-json');
  }
}

export const INVALID_JSON = Symbol.for('invalid-json');

export function createJsonServer(router: Router, mapError: ErrorMapper, notFound: RouteResult): http.Server {
  return http.createServer(async (req, res) => {
    let result: RouteResult;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const found = router.find(req.method ?? 'GET', url.pathname);
      if (!found) {
        result = notFound;
      } else {
        const body = await readBody(req);
        result = await found.handler({
          params: found.params,
          query: url.searchParams,
          headers: req.headers,
          body,
          method: req.method ?? 'GET',
          path: url.pathname,
        });
      }
    } catch (error) {
      result = mapError(error);
    }
    const payload = result.body === undefined ? '' : JSON.stringify(result.body);
    res.writeHead(result.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      ...(result.headers ?? {}),
    });
    res.end(payload);
  });
}

export function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });
}

export function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}
