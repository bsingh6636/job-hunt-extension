import http from 'node:http';
import { isSampleId, samplesIndexHtml } from './samples.mjs';

/**
 * Tiny HTTP API over the store. No framework, no dependencies.
 *
 *   GET    /health                       -> { ok, db, counts }
 *   GET    /api/:collection              -> T[]
 *   GET    /api/:collection/:id          -> T | 404
 *   PUT    /api/:collection/:id          -> T          (body: T)
 *   POST   /api/:collection/bulk         -> { stored } (body: T[])
 *   POST   /api/:collection/bulk-delete  -> { removed } (body: string[])
 *   DELETE /api/:collection/:id          -> 204
 *   DELETE /api/:collection              -> { removed }
 *
 *   Page samples (when a sample store is passed):
 *   GET    /samples                      -> HTML index to browse samples
 *   GET    /samples.json                 -> [{ id, url, at, note, htmlBytes }]
 *   POST   /samples                      -> { id, viewUrl, detailsUrl, htmlFile } (body: { meta, html })
 *   GET    /samples/:id.html             -> the saved page, scripts blocked by CSP
 *   GET    /samples/:id.json             -> the sample's metadata and id scan
 *   DELETE /samples/:id                  -> 204
 *
 * Collections are validated against ALLOWED so a typo cannot create junk.
 * CORS is wide open because the server binds to 127.0.0.1 only.
 */
export const ALLOWED = new Set(['posts', 'searches', 'whatsappPosts', 'applications', 'fillReports']);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '600',
};

function send(res, status, body) {
  const headers = { ...CORS };
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  headers['content-type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

/** Saved pages must never run LinkedIn's code or call out when viewed. */
const PAGE_CSP = "script-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'";

function sendText(res, status, text, type, extra = {}) {
  res.writeHead(status, { ...CORS, 'content-type': type, ...extra });
  res.end(text);
}

async function handleSamples(req, res, method, pathname, samples) {
  if (pathname === '/samples' || pathname === '/samples/') {
    if (method === 'GET') {
      return sendText(res, 200, samplesIndexHtml(samples.list(), samples.dir), 'text/html; charset=utf-8', { 'content-security-policy': PAGE_CSP });
    }
    if (method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body.html !== 'string') return send(res, 400, { error: 'body must be { meta, html }' });
      const saved = samples.save({ meta: body.meta ?? {}, html: body.html });
      return send(res, 201, { ...saved, viewUrl: `/samples/${saved.id}.html`, detailsUrl: `/samples/${saved.id}.json`, indexUrl: '/samples' });
    }
    return send(res, 405, { error: 'method not allowed' });
  }
  if (pathname === '/samples.json') return method === 'GET' ? send(res, 200, samples.list()) : send(res, 405, { error: 'method not allowed' });

  const match = /^\/samples\/([^/]+?)(?:\.(html|json))?$/.exec(pathname);
  if (!match) return send(res, 404, { error: 'not found' });
  const id = decodeURIComponent(match[1]);
  if (!isSampleId(id)) return send(res, 400, { error: 'bad sample id' });
  if (method === 'DELETE') return samples.remove(id) ? send(res, 204) : send(res, 404, { error: 'not found' });
  if (method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  if (match[2] === 'json') {
    const meta = samples.readMeta(id);
    return meta ? send(res, 200, meta) : send(res, 404, { error: 'not found' });
  }
  const html = samples.readHtml(id);
  return html === undefined ? send(res, 404, { error: 'not found' }) : sendText(res, 200, html, 'text/html; charset=utf-8', { 'content-security-policy': PAGE_CSP });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {ReturnType<typeof import('./store.mjs').createStore>} store
 * @param {{ log?: (line: string) => void, samples?: ReturnType<typeof import('./samples.mjs').createSampleStore> }} [options]
 */
export function createApp(store, { log = () => {}, samples } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const method = req.method ?? 'GET';
    log(`${method} ${url.pathname}`);

    try {
      if (method === 'OPTIONS') return send(res, 204);
      if (url.pathname === '/health') {
        return send(res, 200, { ok: true, db: store.path, counts: store.counts(), samples: samples ? { dir: samples.dir, count: samples.count() } : null });
      }
      if (url.pathname === '/samples' || url.pathname.startsWith('/samples/') || url.pathname === '/samples.json') {
        if (!samples) return send(res, 404, { error: 'page samples are not enabled on this server' });
        return await handleSamples(req, res, method, url.pathname, samples);
      }

      const match = /^\/api\/([a-zA-Z]+)(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match) return send(res, 404, { error: 'not found' });
      const collection = match[1];
      const tail = match[2] ? decodeURIComponent(match[2]) : undefined;
      if (!ALLOWED.has(collection)) return send(res, 404, { error: `unknown collection "${collection}"` });

      if (method === 'GET' && !tail) return send(res, 200, store.list(collection));
      if (method === 'GET') {
        const item = store.get(collection, tail);
        return item ? send(res, 200, item) : send(res, 404, { error: 'not found' });
      }
      if (method === 'PUT' && tail) {
        const item = await readJson(req);
        if (!item || item.id !== tail) return send(res, 400, { error: 'body.id must equal the URL id' });
        store.put(collection, item);
        return send(res, 200, item);
      }
      if (method === 'POST' && tail === 'bulk') {
        const items = await readJson(req);
        if (!Array.isArray(items)) return send(res, 400, { error: 'body must be an array' });
        return send(res, 200, { stored: store.putMany(collection, items) });
      }
      if (method === 'POST' && tail === 'bulk-delete') {
        const ids = await readJson(req);
        if (!Array.isArray(ids)) return send(res, 400, { error: 'body must be an array of ids' });
        return send(res, 200, { removed: store.removeMany(collection, ids) });
      }
      if (method === 'DELETE' && tail) {
        store.remove(collection, tail);
        return send(res, 204);
      }
      if (method === 'DELETE') return send(res, 200, { removed: store.clear(collection) });

      return send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      log(`error: ${err.message}`);
      return send(res, 500, { error: err.message });
    }
  });
}
