/**
 * Thin fetch wrapper for the web API (`/web/*`). Adds the CSRF header on every
 * request, sends cookies, and turns non-2xx responses into `ApiError`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as any).error) : `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { ...CSRF }, credentials: 'same-origin' };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const parsed = await parse(res);
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  /** Upload multipart form data (evidence). Browser sets the boundary. */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { ...CSRF },
      credentials: 'same-origin',
      body: form,
    });
    const parsed = await parse(res);
    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed as T;
  },
};
