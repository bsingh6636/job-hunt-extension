// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.mjs';
import { createSampleStore } from '../server/samples.mjs';
import { createStore } from '../server/store.mjs';

let base = '';
let app: ReturnType<typeof createApp>;
let store: ReturnType<typeof createStore>;
let dir = '';

const json = async (method: string, p: string, body?: unknown) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? undefined : await res.json() };
};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'jobhunt-'));
  store = createStore(path.join(dir, 'test.sqlite'));
  app = createApp(store, { samples: createSampleStore(path.join(dir, 'samples')) });
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => app.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('local storage server', () => {
  it('health reports counts', async () => {
    const { status, body } = await json('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.counts).toEqual({});
  });

  it('rejects unknown collections', async () => {
    expect((await json('GET', '/api/nope')).status).toBe(404);
  });

  it('put, get, list, bulk, delete round trip', async () => {
    const post = { id: 'activity:1', text: 'hello', emails: ['a@b.com'], status: 'new' };
    expect((await json('PUT', '/api/posts/activity:1', post)).status).toBe(200);
    expect((await json('PUT', '/api/posts/activity:1', { ...post, id: 'other' })).status).toBe(400);

    expect((await json('GET', '/api/posts/activity:1')).body).toEqual(post);
    expect((await json('GET', '/api/posts/missing')).status).toBe(404);

    const bulk = await json('POST', '/api/posts/bulk', [
      { id: 'activity:2', text: 'two' },
      { id: 'activity:1', text: 'hello updated', status: 'contacted' },
    ]);
    expect(bulk.body).toEqual({ stored: 2 });

    const list = (await json('GET', '/api/posts')).body as { id: string; text: string }[];
    expect(list.map((p) => p.id).sort()).toEqual(['activity:1', 'activity:2']);
    expect(list.find((p) => p.id === 'activity:1')?.text).toBe('hello updated');

    // SQL view is browsable
    expect(store.list('posts')).toHaveLength(2);

    expect((await json('POST', '/api/posts/bulk-delete', ['activity:2'])).body).toEqual({ removed: 1 });
    expect((await json('DELETE', '/api/posts/activity:1')).status).toBe(204);
    expect((await json('GET', '/api/posts')).body).toEqual([]);

    await json('PUT', '/api/applications/app_1', { id: 'app_1', company: 'Acme' });
    expect((await json('DELETE', '/api/applications')).body).toEqual({ removed: 1 });
  });

  it('answers CORS preflight', async () => {
    const res = await fetch(base + '/api/posts', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('page samples API', () => {
  it('saves a page, lists it, serves it with scripts blocked, and deletes it', async () => {
    const html = '<!DOCTYPE html><html><body><main>Hiring MERN</main></body></html>';
    const saved = await json('POST', '/samples', { meta: { url: 'https://www.linkedin.com/search/results/content/?k=1', at: '2026-11-13T10:00:00Z', note: 'n1' }, html });
    expect(saved.status).toBe(201);
    expect(saved.body.id).toMatch(/linkedin-com-search-results-content$/);
    expect(saved.body.htmlFile).toMatch(/\.html$/);

    const list = await json('GET', '/samples.json');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: saved.body.id, note: 'n1' });

    const page = await fetch(base + saved.body.viewUrl);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("script-src 'none'");
    expect(await page.text()).toBe(html);

    const details = await json('GET', saved.body.detailsUrl);
    expect(details.body).toMatchObject({ note: 'n1', htmlBytes: html.length });

    const index = await fetch(base + '/samples');
    expect(await index.text()).toContain(saved.body.id);

    const health = await json('GET', '/health');
    expect(health.body.samples.count).toBe(1);

    expect((await json('GET', '/samples/..%2F..%2Fpackage.html')).status).toBe(400);
    expect((await json('POST', '/samples', { meta: {} })).status).toBe(400);
    expect((await json('DELETE', `/samples/${saved.body.id}`)).status).toBe(204);
    expect((await json('GET', '/samples.json')).body).toHaveLength(0);
  });
});
