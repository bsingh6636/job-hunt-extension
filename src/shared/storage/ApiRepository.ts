import type { Entity, Repository } from './Repository';

/**
 * Repository backed by the local storage server (server/index.mjs) or, in
 * Phase 2, a remote backend with the same routes. See server/app.mjs for
 * the route list. The extension never caches these collections in the
 * browser; every read goes to the server.
 */
export class ApiRepository<T extends Entity> implements Repository<T> {
  constructor(
    private readonly baseUrl: string,
    private readonly collection: string,
    private readonly getToken: () => Promise<string | undefined> = async () => undefined,
  ) {}

  private async request<R>(path: string, init: RequestInit = {}): Promise<R> {
    const token = await this.getToken();
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/${this.collection}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new Error(`Storage server not reachable at ${this.baseUrl}. Start it with: npm run server`);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: string }).error ?? '';
      } catch {
        /* ignore */
      }
      throw new Error(`Storage server ${init.method ?? 'GET'} ${path || '/'} failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    return res.status === 204 ? (undefined as R) : ((await res.json()) as R);
  }

  async get(id: string): Promise<T | undefined> {
    try {
      return await this.request<T>(`/${encodeURIComponent(id)}`);
    } catch (err) {
      if (/\(404\)/.test((err as Error).message)) return undefined;
      throw err;
    }
  }
  list() {
    return this.request<T[]>('');
  }
  async put(item: T) {
    await this.request(`/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify(item) });
  }
  async putMany(items: T[]) {
    if (items.length === 0) return;
    await this.request('/bulk', { method: 'POST', body: JSON.stringify(items) });
  }
  async remove(id: string) {
    await this.request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async removeMany(ids: string[]) {
    if (ids.length === 0) return;
    await this.request('/bulk-delete', { method: 'POST', body: JSON.stringify(ids) });
  }
  async clear() {
    await this.request('', { method: 'DELETE' });
  }
  /** Change notifications come from the DATA_CHANGED runtime message; see SwitchingRepository. */
  subscribe(): () => void {
    return () => {};
  }
}

/** Probe the server. Resolves with counts or throws a readable error. */
export async function checkServer(baseUrl: string): Promise<{ db: string; counts: Record<string, number> }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, { cache: 'no-store' });
  } catch {
    throw new Error(`Storage server not reachable at ${baseUrl}. Start it with: npm run server`);
  }
  if (!res.ok) throw new Error(`Storage server health check failed (${res.status})`);
  return (await res.json()) as { db: string; counts: Record<string, number> };
}
