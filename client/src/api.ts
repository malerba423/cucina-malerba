import { useEffect, useState } from 'react';

export type ApiState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/** Fetches JSON from the API and re-fetches when `url` changes. Keeps old data while loading. */
export function useApi<T>(url: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', data: 'data' in prev ? prev.data : undefined }));

    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (res.status === 404) return setState({ status: 'not-found' });
        if (!res.ok) throw new Error(`The server answered ${res.status}`);
        setState({ status: 'ok', data: (await res.json()) as T });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Network error' });
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

/** Returns `value`, updated only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export type SendResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** POST/PATCH/DELETE JSON to the API. Never throws; errors come back as { ok: false }. */
export async function send<T = unknown>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<SendResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: (data as { error?: string }).error ?? `The server answered ${res.status}` };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection." };
  }
}
