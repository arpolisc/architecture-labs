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

/** HTTP-виклик із обов’язковим тайм-аутом; помилки мережі та тайм-аут перетворюються на типізовані винятки. */
export async function requestJson(url: string, options: JsonRequestOptions): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    return { status: response.status, body };
  } catch (error) {
    if (controller.signal.aborted) throw new UpstreamTimeoutError(url, options.timeoutMs);
    throw new UpstreamUnavailableError(url, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
