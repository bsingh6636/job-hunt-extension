import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Page samples captured by the extension ("Save page sample"), stored as
 * plain files so they can be opened, grepped and diffed:
 *
 *   <dir>/<id>.html   the full page HTML (scripts neutralised by the extension)
 *   <dir>/<id>.json   everything else: url, time, note, id scan, inventories
 *
 * Ids are generated here and validated on every read so a request can never
 * reach outside <dir>.
 */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;

export const isSampleId = (id) => typeof id === 'string' && ID_RE.test(id) && !id.includes('..');

function slug(url) {
  try {
    const u = new URL(url);
    const tail = `${u.hostname.replace(/^www\./, '')}${u.pathname}`;
    return tail.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
  } catch {
    return 'page';
  }
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function createSampleStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = (id, ext) => path.join(dir, `${id}.${ext}`);

  return {
    dir,

    save({ meta = {}, html = '' }) {
      let id = `${stamp()}-${slug(meta.url)}`;
      for (let n = 2; existsSync(file(id, 'json')); n++) id = `${stamp()}-${slug(meta.url)}-${n}`;
      const record = { ...meta, id, htmlBytes: Buffer.byteLength(html, 'utf8'), savedAt: new Date().toISOString() };
      writeFileSync(file(id, 'html'), html, 'utf8');
      writeFileSync(file(id, 'json'), JSON.stringify(record, null, 2), 'utf8');
      return { id, htmlFile: file(id, 'html'), jsonFile: file(id, 'json'), htmlBytes: record.htmlBytes };
    },

    list() {
      return readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          try {
            const meta = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
            return { id: meta.id, url: meta.url, at: meta.at ?? meta.savedAt, note: meta.note ?? '', htmlBytes: meta.htmlBytes ?? 0 };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },

    readHtml(id) {
      return isSampleId(id) && existsSync(file(id, 'html')) ? readFileSync(file(id, 'html'), 'utf8') : undefined;
    },

    readMeta(id) {
      return isSampleId(id) && existsSync(file(id, 'json')) ? JSON.parse(readFileSync(file(id, 'json'), 'utf8')) : undefined;
    },

    remove(id) {
      if (!isSampleId(id)) return false;
      let removed = false;
      for (const ext of ['html', 'json']) {
        if (existsSync(file(id, ext))) {
          rmSync(file(id, ext));
          removed = true;
        }
      }
      return removed;
    },

    count() {
      return readdirSync(dir).filter((name) => name.endsWith('.json')).length;
    },
  };
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Browser index of saved samples: GET /samples. */
export function samplesIndexHtml(list, dir) {
  const rows = list
    .map(
      (s) => `<tr>
  <td>${escapeHtml(s.at)}</td>
  <td class="url">${escapeHtml(s.url)}</td>
  <td>${escapeHtml(s.note).replace(/\n/g, '<br>')}</td>
  <td>${Math.round(s.htmlBytes / 1024)} KB</td>
  <td><a href="/samples/${encodeURIComponent(s.id)}.html" target="_blank">view page</a> · <a href="/samples/${encodeURIComponent(s.id)}.json" target="_blank">details</a></td>
</tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Page samples</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; color: #1d2226; background: #fff; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  td.url { max-width: 420px; word-break: break-all; }
  code { background: #f3f2ef; padding: 1px 4px; }
</style></head>
<body>
<h1>Page samples (${list.length})</h1>
<p>Saved by the extension's <b>Save page sample</b> button. Files live in <code>${escapeHtml(dir)}</code>. Pages are shown with scripts disabled.</p>
<table><thead><tr><th>Captured</th><th>Page</th><th>Note</th><th>HTML</th><th></th></tr></thead>
<tbody>
${rows || '<tr><td colspan="5">No samples yet.</td></tr>'}
</tbody></table>
</body></html>`;
}
