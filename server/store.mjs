import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite-backed document store. One generic `documents` table keyed by
 * (collection, id) holding the JSON the extension already uses, plus SQL
 * views so you can browse posts, searches, WhatsApp posts and applications with any SQLite client
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
             -- Posts keep only searchIds; the URLs live once in the 'searches' collection.
             -- Posts stored before that still hold sourceUrl/sourceUrls themselves.
             CASE WHEN json_type(d.data, '$.searchIds') = 'array'
               THEN (SELECT json_extract(s.data, '$.url') FROM documents s
                     WHERE s.collection = 'searches' AND s.id = json_extract(d.data, '$.searchIds[0]'))
               ELSE json_extract(data, '$.sourceUrl') END AS source_url,
             CASE WHEN json_type(d.data, '$.searchIds') = 'array'
               THEN (SELECT json_group_array(COALESCE(json_extract(s.data, '$.url'), j.value))
                     FROM json_each(d.data, '$.searchIds') j
                     LEFT JOIN documents s ON s.collection = 'searches' AND s.id = j.value)
               ELSE COALESCE(json_extract(data, '$.sourceUrls'), json_array(json_extract(data, '$.sourceUrl'))) END AS source_urls,
             json_extract(data, '$.searchIds')         AS search_ids,
             created_at, updated_at
      FROM documents d WHERE collection = 'posts';

    -- One row per LinkedIn search/feed URL that posts were captured from.
    DROP VIEW IF EXISTS searches;
    CREATE VIEW searches AS
      SELECT d.id,
             json_extract(d.data, '$.keywords')    AS keywords,
             json_extract(d.data, '$.url')         AS url,
             json_extract(d.data, '$.firstSeenAt') AS first_seen_at,
             json_extract(d.data, '$.lastSeenAt')  AS last_seen_at,
             (SELECT COUNT(*) FROM documents p, json_each(p.data, '$.searchIds') j
               WHERE p.collection = 'posts' AND j.value = d.id) AS posts,
             d.created_at, d.updated_at
      FROM documents d WHERE d.collection = 'searches';

    DROP VIEW IF EXISTS whatsapp_posts;
    CREATE VIEW whatsapp_posts AS
      SELECT id,
             json_extract(data, '$.chat')            AS chat,
             json_extract(data, '$.sender.name')     AS sender,
             json_extract(data, '$.sender.phone')    AS sender_phone,
             json_extract(data, '$.postedAt')        AS posted_at,
             json_extract(data, '$.experience.min')  AS exp_min,
             json_extract(data, '$.experience.max')  AS exp_max,
             json_extract(data, '$.emails')          AS emails,
             json_extract(data, '$.phones')          AS phones,
             json_extract(data, '$.links')           AS links,
             json_extract(data, '$.matchedKeywords') AS keywords,
             json_array_length(data, '$.sightings')  AS times_seen,
             (SELECT json_group_array(DISTINCT json_extract(s.value, '$.chat')) FROM json_each(data, '$.sightings') s) AS chats,
             json_extract(data, '$.status')          AS status,
             json_extract(data, '$.notes')           AS notes,
             json_extract(data, '$.text')            AS text,
             json_extract(data, '$.capturedAt')      AS captured_at,
             json_extract(data, '$.lastSeenAt')      AS last_seen_at,
             created_at, updated_at
      FROM documents WHERE collection = 'whatsappPosts';

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
    searchPosts: db.prepare(`
  SELECT data
  FROM documents
  WHERE collection = 'posts'
  ORDER BY
    julianday(json_extract(data, '$.capturedAt')) DESC,
    id DESC
  LIMIT ?
`),
  };

  const parse = (row) => (row ? JSON.parse(row.data) : undefined);

  return {
    path: dbPath,
    list: (collection) => stmts.list.all(collection).map(parse),
    searchPosts({ limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit must be an integer between 1 and 100');
  }

  return stmts.searchPosts.all(limit).map(parse);
},
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
