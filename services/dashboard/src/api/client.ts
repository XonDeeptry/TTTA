export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // F12 FR-08 (additive): parsed JSON error body + its `.message` when a string, so callers
    // can surface a server message verbatim (e.g. `{message:'invalid rubric', issues:[…]}`)
    // without re-parsing `.message` above, whose format stays byte-identical for every
    // pre-existing caller (AC-08.2).
    public body?: unknown,
    public serverMessage?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    // AC-08.3: parsing the body never throws and never changes the status; a non-JSON/empty
    // body just leaves `body`/`serverMessage` undefined.
    let body: unknown;
    try {
      const text = await res.text();
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const serverMessage =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : undefined;
    throw new ApiError(res.status, `${options.method ?? 'GET'} ${path} failed: ${res.status}`, body, serverMessage);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
