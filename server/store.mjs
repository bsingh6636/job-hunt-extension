import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite-backed document store. One generic `documents` table keyed by
 * (collection, id) holding the JSON the extension already uses, plus SQL
 * views so you can browse posts and applications with any SQLite client
 * (DB Browser for SQLite, the sqlite3 CLI, VS Code SQLite extensions).
 */
export function createStore(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS documents_collection ON documents(collection);

    DROP VIEW IF EXISTS posts;
    CREATE VIEW posts AS
      SELECT id,
             json_extract(data, '$.author.name')       AS author,
             json_extract(data, '$.author.headline')   AS headline,
             json_extract(data, '$.author.profileUrl') AS profile_url,
             json_extract(data, '$.url')               AS post_url,
             COALESCE(json_extract(data, '$.urlKind'), 'post') AS url_kind,
             json_extract(data, '$.postedAt')          AS posted_at,
             COALESCE(json_extract(data, '$.postedAtApprox'), 0) AS posted_at_approx,
             json_extract(data, '$.postedAtLabel')     AS posted_label,
             json_extract(data, '$.emails')            AS emails,
             json_extract(data, '$.links')             AS links,
             json_extract(data, '$.matchedKeywords')   AS keywords,
             json_extract(data, '$.status')            AS status,
             json_extract(data, '$.notes')             AS notes,
             json_extract(data, '$.text')              AS text,
             json_extract(data, '$.capturedAt')        AS captured_at,
             COALESCE(json_extract(data, '$.lastSeenAt'), json_extract(data, '$.capturedAt')) AS last_seen_at,
             json_extract(data, '$.sourceUrl')         AS source_url,
             COALESCE(json_extract(data, '$.sourceUrls'), json_array(json_extract(data, '$.sourceUrl'))) AS source_urls,
             created_at, updated_at
      FROM documents WHERE collection = 'posts';

    CREATE VIEW IF NOT EXISTS applications AS
      SELECT id,
             json_extract(data, '$.company') AS company,
             json_extract(data, '$.title')   AS title,
             json_extract(data, '$.url')     AS url,
             json_extract(data, '$.ats')     AS ats,
             json_extract(data, '$.status')  AS status,
             json_extract(data, '$.notes')   AS notes,
             created_at, updated_at
      FROM documents WHERE collection = 'applications';
  `);

  const stmts = {
    list: db.prepare('SELECT data FROM documents WHERE collection = ? ORDER BY updated_at DESC'),
    get: db.prepare('SELECT data FROM documents WHERE collection = ? AND id = ?'),
    upsert: db.prepare(`
      INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `),
    remove: db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?'),
    clear: db.prepare('DELETE FROM documents WHERE collection = ?'),
    counts: db.prepare('SELECT collection, COUNT(*) AS n FROM documents GROUP BY collection'),
  };

  const parse = (row) => (row ? JSON.parse(row.data) : undefined);

  return {
    path: dbPath,
    list: (collection) => stmts.list.all(collection).map(parse),
    get: (collection, id) => parse(stmts.get.get(collection, id)),
    put(collection, item) {
      if (!item || typeof item.id !== 'string') throw new Error('item.id (string) is required');
      stmts.upsert.run(collection, item.id, JSON.stringify(item));
    },
    putMany(collection, items) {
      db.exec('BEGIN');
      try {
        for (const item of items) this.put(collection, item);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return items.length;
    },
    remove: (collection, id) => stmts.remove.run(collection, id).changes,
    removeMany(collection, ids) {
      let n = 0;
      db.exec('BEGIN');
      try {
        for (const id of ids) n += stmts.remove.run(collection, id).changes;
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return n;
    },
    clear: (collection) => stmts.clear.run(collection).changes,
    counts: () => Object.fromEntries(stmts.counts.all().map((r) => [r.collection, r.n])),
    close: () => db.close(),
  };
}
