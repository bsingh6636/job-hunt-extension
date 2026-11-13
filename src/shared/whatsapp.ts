import { getSettings, whatsappRepo } from './storage';
import type { WhatsAppPost, WhatsAppSighting } from './types';
import { matchKeywords } from './utils/keywords';

/** Sightings kept per post. A recruiter who reposts daily would otherwise grow the row forever. */
export const MAX_SIGHTINGS = 50;

const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

/** Earliest message first; sightings without a time go last. */
const byTime = (a: WhatsAppSighting, b: WhatsAppSighting) => (a.postedAt ?? '￿').localeCompare(b.postedAt ?? '￿');

/**
 * Merge a freshly parsed WhatsApp post into a stored one. The same text
 * forwarded into another group arrives with the same id and adds a
 * sighting. The longest text wins (a later "Read more" expansion), contacts
 * are unioned, and chat/sender/postedAt follow the earliest sighting.
 * status, notes and capturedAt stay as first captured.
 */
export function mergeWhatsAppPost(existing: WhatsAppPost | undefined, incoming: WhatsAppPost): WhatsAppPost {
  if (!existing) return incoming;
  const complete = incoming.text.length >= existing.text.length;
  const byId = new Map(existing.sightings.map((s) => [s.messageId, s]));
  for (const s of incoming.sightings) byId.set(s.messageId, { ...byId.get(s.messageId), ...s });
  const sightings = [...byId.values()].sort(byTime).slice(0, MAX_SIGHTINGS);
  const first = sightings[0];
  return {
    ...existing,
    text: complete ? incoming.text : existing.text,
    experience: complete ? incoming.experience : existing.experience,
    emails: union(existing.emails, incoming.emails),
    phones: union(existing.phones, incoming.phones),
    links: complete ? incoming.links : union(existing.links, incoming.links),
    ...(first ? { chat: first.chat, sender: { name: first.sender, phone: first.senderPhone }, postedAt: first.postedAt } : {}),
    sightings,
    lastSeenAt: incoming.lastSeenAt,
  };
}

export function applyWhatsAppKeywords(post: WhatsAppPost, include: string[], exclude: string[]): WhatsAppPost {
  post.matchedKeywords = matchKeywords(post.text, include);
  post.excludedBy = matchKeywords(post.text, exclude);
  return post;
}

/** Background side of WHATSAPP_CAPTURED. A batch may hold the same text twice (two groups), so merge as we go. */
export async function mergeCapturedWhatsApp(posts: WhatsAppPost[]): Promise<{ stored: number; dropped: number }> {
  const settings = await getSettings();
  const known = new Map((await whatsappRepo.list()).map((p) => [p.id, p]));
  const changed = new Map<string, WhatsAppPost>();
  let dropped = 0;

  for (const incoming of posts) {
    const before = known.get(incoming.id);
    const merged = applyWhatsAppKeywords(mergeWhatsAppPost(before, incoming), settings.keywords.include, settings.keywords.exclude);
    if (settings.captureOnlyMatching && !before && merged.matchedKeywords.length === 0) {
      dropped++;
      continue;
    }
    known.set(merged.id, merged);
    changed.set(merged.id, merged);
  }

  await whatsappRepo.putMany([...changed.values()]);
  return { stored: changed.size, dropped };
}

/** Re-run keyword matching over every stored WhatsApp post, e.g. after settings change. */
export async function rematchAllWhatsApp(): Promise<number> {
  const settings = await getSettings();
  const all = (await whatsappRepo.list()).map((p) => applyWhatsAppKeywords(p, settings.keywords.include, settings.keywords.exclude));
  await whatsappRepo.putMany(all);
  return all.length;
}
