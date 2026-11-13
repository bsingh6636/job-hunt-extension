// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
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

  it('keeps WhatsApp posts in their own collection with a whatsapp_posts view', async () => {
    const wa = {
      id: 'wa:abc',
      text: 'Hiring Node.js developer',
      chat: 'Group A',
      sender: { name: 'Ravi', phone: '+919800000001' },
      experience: { min: 2, max: 4 },
      emails: ['jobs@example.org'],
      phones: ['+919876543210'],
      links: [],
      sightings: [
        { messageId: 'm1', chat: 'Group A', sender: 'Ravi' },
        { messageId: 'm2', chat: 'Group B', sender: 'Ravi' },
        { messageId: 'm3', chat: 'Group A', sender: 'Ravi' },
      ],
      status: 'new',
    };
    expect((await json('POST', '/api/whatsappPosts/bulk', [wa])).body).toEqual({ stored: 1 });
    expect((await json('GET', '/api/whatsappPosts')).body).toEqual([wa]);
    expect((await json('GET', '/api/posts')).body).toEqual([]); // never mixed with LinkedIn posts

    const db = new DatabaseSync(store.path, { readOnly: true });
    const row = db.prepare('SELECT chat, sender, sender_phone, exp_min, exp_max, phones, times_seen, chats FROM whatsapp_posts').get();
    db.close();
    expect({ ...row }).toEqual({
      chat: 'Group A',
      sender: 'Ravi',
      sender_phone: '+919800000001',
      exp_min: 2,
      exp_max: 4,
      phones: '["+919876543210"]',
      times_seen: 3,
      chats: '["Group A","Group B"]',
    });
    expect((await json('DELETE', '/api/whatsappPosts')).body).toEqual({ removed: 1 });
  });

  it('keeps search URLs once in searches and resolves them in the posts view', async () => {
    const url = 'https://www.linkedin.com/search/results/content/?keywords=hiring';
    const page = { id: 'search:s1', url, keywords: 'hiring', firstSeenAt: '2026-11-13T01:00:00.000Z', lastSeenAt: '2026-11-13T02:00:00.000Z' };
    expect((await json('POST', '/api/searches/bulk', [page])).body).toEqual({ stored: 1 });
    await json('POST', '/api/posts/bulk', [
      { id: 'text:a', text: 'a', searchIds: ['search:s1', 'search:gone'], status: 'new' },
      { id: 'text:b', text: 'b', sourceUrl: 'https://old.example/', status: 'new' }, // stored before searchIds existed
    ]);

    const db = new DatabaseSync(store.path, { readOnly: true });
    const posts = db.prepare('SELECT id, source_url, source_urls, search_ids FROM posts ORDER BY id').all();
    const searches = db.prepare('SELECT id, keywords, url, first_seen_at, last_seen_at, posts FROM searches').all();
    db.close();
    expect(posts.map((r) => ({ ...r }))).toEqual([
      { id: 'text:a', source_url: url, source_urls: JSON.stringify([url, 'search:gone']), search_ids: '["search:s1","search:gone"]' },
      { id: 'text:b', source_url: 'https://old.example/', source_urls: '["https://old.example/"]', search_ids: null },
    ]);
    expect(searches.map((r) => ({ ...r }))).toEqual([
      { id: 'search:s1', keywords: 'hiring', url, first_seen_at: page.firstSeenAt, last_seen_at: page.lastSeenAt, posts: 1 },
    ]);
    await json('DELETE', '/api/posts');
    await json('DELETE', '/api/searches');
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
