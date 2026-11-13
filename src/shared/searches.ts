import type { ExtractedPost, SearchPage } from './types';
import { hash64 } from './utils/hash';

/**
 * The LinkedIn pages (content searches, the feed) that posts were captured
 * from. Each page URL is stored once in the `searches` collection and a post
 * keeps only the ids (`searchIds`), because the URL is long and identical for
 * every post one search finds (on 2026-11-13: 239 posts, 2 searches, 479
 * copies of the URL, a fifth of the database).
 *
 * Pure functions, no storage imports: the content script uses searchIdOf().
 */

/**
 * Query parameters that differ between two runs of the same search without
 * changing its results: `sid` is a per-visit token, `origin` says whether the
 * search was started from the header or from a filter. Removing them makes the
 * same search get the same id every time.
 */
const VOLATILE_PARAMS = new Set(['sid', 'origin', 'trk', 'trackingId', 'lipi', 'refId', 'searchId']);

function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

/**
 * The page URL without volatile params and #fragment, remaining params sorted.
 * LinkedIn's own percent-encoding is kept as is, so the result still opens the
 * same search.
 */
export function normalizeSearchUrl(raw: string): string {
  const noHash = raw.split('#')[0] ?? raw;
  const q = noHash.indexOf('?');
  if (q < 0) return noHash;
  const params = noHash
    .slice(q + 1)
    .split('&')
    .filter((pair) => pair !== '' && !VOLATILE_PARAMS.has(decodeKey(pair.split('=')[0] ?? '')))
    .sort();
  return params.length > 0 ? `${noHash.slice(0, q)}?${params.join('&')}` : noHash.slice(0, q);
}

/** "search:<hash>" of the normalized URL, so the content script and the background agree on the id without a lookup. */
export function searchIdOf(url: string): string {
  return `search:${hash64(normalizeSearchUrl(url))}`;
}

/** The decoded `keywords=` value, e.g. `"hiring" MERN NOT SENIOR`. Undefined on the feed. */
export function searchKeywords(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('keywords')?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Short name for menus: the keywords, else the path ("/feed/"). */
export function searchLabel(page: SearchPage): string {
  if (page.keywords) return page.keywords;
  try {
    return new URL(page.url).pathname;
  } catch {
    return page.url;
  }
}

export function searchPageFor(url: string, at: string): SearchPage {
  const normalized = normalizeSearchUrl(url);
  const keywords = searchKeywords(normalized);
  return { id: searchIdOf(normalized), url: normalized, ...(keywords ? { keywords } : {}), firstSeenAt: at, lastSeenAt: at };
}

const unique = (items: string[]) => Array.from(new Set(items));

/** URLs a post stored before 2026-11-13 holds itself (sourceUrls, else sourceUrl). */
function legacyUrls(post: ExtractedPost): string[] {
  return post.sourceUrls ?? (post.sourceUrl ? [post.sourceUrl] : []);
}

export function hasLegacyUrls(post: ExtractedPost): boolean {
  return post.sourceUrl !== undefined || post.sourceUrls !== undefined;
}

/** Ids of every page that showed the post, oldest first. */
export function searchIdsOf(post: ExtractedPost): string[] {
  return post.searchIds ?? unique(legacyUrls(post).map(searchIdOf));
}

/** URLs of every page that showed the post, oldest first, for exports. An id with no stored page is returned as is. */
export function searchUrlsOf(post: ExtractedPost, searches: ReadonlyMap<string, SearchPage>): string[] {
  if (!post.searchIds) return legacyUrls(post);
  return post.searchIds.map((id) => searches.get(id)?.url ?? id);
}

/**
 * The stored search pages plus what one capture adds or changes.
 * `see(url, at)` records that the page was seen at `at` and returns its id;
 * `changed()` lists the pages to write back.
 */
export function searchBook(stored: SearchPage[]) {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const changed = new Map<string, SearchPage>();
  return {
    see(url: string, at: string): string {
      const seen = searchPageFor(url, at);
      const old = byId.get(seen.id);
      // ISO timestamps compare correctly as strings.
      const next = old
        ? { ...old, firstSeenAt: at < old.firstSeenAt ? at : old.firstSeenAt, lastSeenAt: at > old.lastSeenAt ? at : old.lastSeenAt }
        : seen;
      if (!old || next.firstSeenAt !== old.firstSeenAt || next.lastSeenAt !== old.lastSeenAt) {
        byId.set(seen.id, next);
        changed.set(seen.id, next);
      }
      return seen.id;
    },
    changed: () => [...changed.values()],
  };
}

export type SearchBook = ReturnType<typeof searchBook>;

/**
 * Moves the URLs a post stored before 2026-11-13 holds itself into the book
 * and returns the post with `searchIds` instead. The first URL is dated by
 * the post's capturedAt, the latest by its lastSeenAt; times in between were
 * never recorded.
 */
export function liftLegacyUrls(post: ExtractedPost, book: SearchBook): ExtractedPost {
  const { sourceUrl: _first, sourceUrls: _all, ...rest } = post;
  const urls = legacyUrls(post);
  const last = post.lastSeenAt ?? post.capturedAt;
  const ids = urls.map((url, i) => {
    const id = book.see(url, i === 0 ? post.capturedAt : last);
    if (i === urls.length - 1) book.see(url, last);
    return id;
  });
  return { ...rest, searchIds: unique([...(post.searchIds ?? []), ...ids]) };
}
