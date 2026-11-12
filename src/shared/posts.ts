import { getSettings, postsRepo } from './storage';
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
    sourceUrls: union(existing.sourceUrls ?? [existing.sourceUrl], incoming.sourceUrls ?? [incoming.sourceUrl]),
    // status, notes, capturedAt, sourceUrl stay as first captured
  };
}

export function applyKeywords(post: ExtractedPost, include: string[], exclude: string[]): ExtractedPost {
  const haystack = `${post.text}\n${post.author.headline ?? ''}`;
  post.matchedKeywords = matchKeywords(haystack, include);
  post.excludedBy = matchKeywords(haystack, exclude);
  return post;
}

export async function mergeCapturedPosts(posts: ExtractedPost[]): Promise<{ stored: number; dropped: number }> {
  const settings = await getSettings();
  const existingById = new Map((await postsRepo.list()).map((p) => [p.id, p]));
  const toStore: ExtractedPost[] = [];
  let dropped = 0;

  for (const incoming of posts) {
    const merged = applyKeywords(mergePost(existingById.get(incoming.id), incoming), settings.keywords.include, settings.keywords.exclude);
    if (settings.captureOnlyMatching && merged.matchedKeywords.length === 0 && !existingById.has(incoming.id)) {
      dropped++;
      continue;
    }
    toStore.push(merged);
  }

  await postsRepo.putMany(toStore);
  return { stored: toStore.length, dropped };
}

/** Re-run keyword matching over everything stored, e.g. after settings change. */
export async function rematchAllPosts(): Promise<number> {
  const settings = await getSettings();
  const all = (await postsRepo.list()).map((p) => applyKeywords(p, settings.keywords.include, settings.keywords.exclude));
  await postsRepo.putMany(all);
  return all.length;
}
