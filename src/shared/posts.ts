import { hasLegacyUrls, liftLegacyUrls, searchBook, searchIdsOf } from './searches';
import { getSettings, postsRepo, searchesRepo } from './storage';
import type { ExtractedPost } from './types';
import { matchKeywords } from './utils/keywords';

const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

/**
 * Merge a freshly parsed post into a stored one. The content script may send
 * the same post several times (before and after "...more" expansion), so keep
 * the longest text and never lose user-entered status or notes. A parse with
 * at least as much text replaces the links, so a re-extract after a parser
 * fix drops links the old parser got wrong.
 */
export function mergePost(existing: ExtractedPost | undefined, incoming: ExtractedPost): ExtractedPost {
  if (!existing) return incoming;
  const complete = incoming.text.length >= existing.text.length;
  return {
    ...existing,
    text: complete ? incoming.text : existing.text,
    emails: union(existing.emails, incoming.emails),
    links: complete ? incoming.links : union(existing.links, incoming.links),
    author: {
      name: incoming.author.name || existing.author.name,
      headline: incoming.author.headline ?? existing.author.headline,
      profileUrl: incoming.author.profileUrl ?? existing.author.profileUrl,
    },
    // Prefer an exact time (from a post id) over an estimate from "2d".
    ...(existing.postedAt && !(existing.postedAtApprox && incoming.postedAt && !incoming.postedAtApprox)
      ? { postedAt: existing.postedAt, postedAtApprox: existing.postedAtApprox }
      : { postedAt: incoming.postedAt, postedAtApprox: incoming.postedAtApprox }),
    url: existing.urlKind && existing.urlKind !== 'post' && incoming.urlKind === 'post' ? incoming.url : existing.url,
    urlKind: existing.urlKind && existing.urlKind !== 'post' && incoming.urlKind === 'post' ? incoming.urlKind : existing.urlKind,
    postedAtLabel: existing.postedAtLabel ?? incoming.postedAtLabel,
    lastSeenAt: incoming.lastSeenAt ?? incoming.capturedAt,
    searchIds: union(searchIdsOf(existing), searchIdsOf(incoming)),
    // status, notes, capturedAt and searchIds[0] stay as first captured
  };
}

export function applyKeywords(post: ExtractedPost, include: string[], exclude: string[]): ExtractedPost {
  const haystack = `${post.text}\n${post.author.headline ?? ''}`;
  post.matchedKeywords = matchKeywords(haystack, include);
  post.excludedBy = matchKeywords(haystack, exclude);
  return post;
}

/**
 * Store a batch from the content script. `pageUrl` (the search or feed the
 * batch came from) is written once to `searches`; posts keep only its id.
 */
export async function mergeCapturedPosts(posts: ExtractedPost[], pageUrl?: string): Promise<{ stored: number; dropped: number }> {
  const settings = await getSettings();
  const book = searchBook(await searchesRepo.list());
  if (pageUrl) book.see(pageUrl, new Date().toISOString());

  // Posts stored before searchIds existed hold the page URL itself. The first
  // capture after the update moves every such URL into `searches`, once.
  const toStore = new Map<string, ExtractedPost>();
  const existingById = new Map<string, ExtractedPost>();
  for (const stored of await postsRepo.list()) {
    if (hasLegacyUrls(stored)) {
      const lifted = liftLegacyUrls(stored, book);
      toStore.set(lifted.id, lifted);
      existingById.set(lifted.id, lifted);
    } else {
      existingById.set(stored.id, stored);
    }
  }

  let kept = 0;
  let dropped = 0;
  for (const raw of posts) {
    // A content script from an older build still sends sourceUrl.
    const incoming = hasLegacyUrls(raw) ? liftLegacyUrls(raw, book) : raw;
    const existing = toStore.get(incoming.id) ?? existingById.get(incoming.id);
    const merged = applyKeywords(mergePost(existing, incoming), settings.keywords.include, settings.keywords.exclude);
    if (settings.captureOnlyMatching && merged.matchedKeywords.length === 0 && !existing) {
      dropped++;
      continue;
    }
    toStore.set(merged.id, merged);
    kept++;
  }

  // Pages first, so a stored post never points at a page that is not stored yet.
  const pages = book.changed();
  if (pages.length > 0) await searchesRepo.putMany(pages);
  await postsRepo.putMany([...toStore.values()]);
  return { stored: kept, dropped };
}

/** Re-run keyword matching over everything stored, e.g. after settings change. */
export async function rematchAllPosts(): Promise<number> {
  const settings = await getSettings();
  const all = (await postsRepo.list()).map((p) => applyKeywords(p, settings.keywords.include, settings.keywords.exclude));
  await postsRepo.putMany(all);
  return all.length;
}
