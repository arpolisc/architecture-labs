import * as http from 'node:http';

export class UpstreamTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Тайм-аут ${timeoutMs} мс під час звернення до ${url}`);
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(url: string, reason: string) {
    super(`Сервіс ${url} недоступний: ${reason}`);
  }
}

export interface JsonResponse {
  status: number;
  body: any;
}

export interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs: number;
}

/**
 * HTTP-виклик із обов’язковим тайм-аутом; помилки мережі та тайм-аут перетворюються на типізовані винятки.
 * Для кожного запиту відкривається нове з’єднання (без повторного використання сокетів): після перезапуску
 * сервісу клієнт не потрапляє на «мертве» з’єднання.
 */
export function requestJson(url: string, options: JsonRequestOptions): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string | number> = {
      Connection: 'close',
      ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(options.headers ?? {}),
    };

    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };

    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: options.method ?? 'GET',
        headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', (error) => finish(() => reject(new UpstreamUnavailableError(url, error.message))));
        res.on('end', () =>
          finish(() => {
            const text = Buffer.concat(chunks).toString('utf8');
            let body: unknown;
            if (text) {
              try {
                body = JSON.parse(text);
              } catch {
                body = undefined;
              }
            }
            resolve({ status: res.statusCode ?? 0, body });
          }),
        );
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new UpstreamTimeoutError(url, options.timeoutMs)));
    }, options.timeoutMs);
    req.on('error', (error) => finish(() => reject(new UpstreamUnavailableError(url, error.message))));
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
