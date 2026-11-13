import { searchUrlsOf } from '@shared/searches';
import type { ExtractedPost, SearchPage, WhatsAppPost } from '@shared/types';
import { toCsv } from '@shared/utils/csv';
import { experienceLabel } from '@shared/utils/jobtext';
import { formatPhone, normalizePhone } from '@shared/utils/phone';

export const POST_CSV_COLUMNS = [
  'id',
  'url',
  'urlKind',
  'authorName',
  'authorHeadline',
  'authorProfileUrl',
  'postedAt',
  'postedAtApprox',
  'postedAtLabel',
  'emails',
  'links',
  'matchedKeywords',
  'excludedBy',
  'status',
  'notes',
  'text',
  'capturedAt',
  'lastSeenAt',
  'sourceUrl',
  'sourceUrls',
];

/** Stored search pages by id. Posts keep only `searchIds`; exports turn them back into URLs. */
export type SearchIndex = ReadonlyMap<string, SearchPage>;
const NO_SEARCHES: SearchIndex = new Map();

export function postToRow(p: ExtractedPost, searches: SearchIndex = NO_SEARCHES): Record<string, unknown> {
  const sourceUrls = searchUrlsOf(p, searches);
  return {
    id: p.id,
    url: p.url,
    urlKind: p.urlKind ?? 'post',
    authorName: p.author.name,
    authorHeadline: p.author.headline ?? '',
    authorProfileUrl: p.author.profileUrl ?? '',
    postedAt: p.postedAt ?? '',
    postedAtApprox: p.postedAtApprox ? 'yes' : '',
    postedAtLabel: p.postedAtLabel ?? '',
    emails: p.emails,
    links: p.links,
    matchedKeywords: p.matchedKeywords,
    excludedBy: p.excludedBy,
    status: p.status,
    notes: p.notes ?? '',
    text: p.text,
    capturedAt: p.capturedAt,
    lastSeenAt: p.lastSeenAt ?? p.capturedAt,
    sourceUrl: sourceUrls[0] ?? '',
    sourceUrls,
  };
}

export const postsToCsv = (posts: ExtractedPost[], searches: SearchIndex = NO_SEARCHES) =>
  toCsv(posts.map((p) => postToRow(p, searches)), POST_CSV_COLUMNS);
/** Stored posts plus `sourceUrls` resolved from `searchIds`, so the file stands on its own. */
export const postsToJson = (posts: ExtractedPost[], searches: SearchIndex = NO_SEARCHES) =>
  JSON.stringify(posts.map((p) => ({ ...p, sourceUrls: searchUrlsOf(p, searches) })), null, 2);

/** Everything about one post as readable text, for pasting into notes or an email draft. */
export function postToText(p: ExtractedPost, searches: SearchIndex = NO_SEARCHES): string {
  const lines = [
    `Author: ${p.author.name}${p.author.headline ? ` - ${p.author.headline}` : ''}`,
    p.author.profileUrl ? `Profile: ${p.author.profileUrl}` : '',
    `${p.urlKind === 'author-activity' ? "Post (author's activity page; post link not on the page)" : 'Post'}: ${p.url}`,
    `Posted: ${p.postedAt ? `${p.postedAtApprox ? 'about ' : ''}${formatDate(p.postedAt)}` : 'unknown'}${p.postedAtLabel ? ` (${p.postedAtLabel})` : ''}`,
    `Captured: ${formatDate(p.capturedAt)}${p.lastSeenAt && p.lastSeenAt !== p.capturedAt ? `, last seen ${formatDate(p.lastSeenAt)}` : ''}`,
    `Found via: ${searchUrlsOf(p, searches).join(' , ')}`,
    `Emails: ${p.emails.length ? p.emails.join(', ') : 'none'}`,
    p.links.length ? `Links: ${p.links.join(', ')}` : '',
    p.matchedKeywords.length ? `Keywords: ${p.matchedKeywords.join(', ')}` : '',
    `Status: ${p.status}`,
    p.notes ? `Notes: ${p.notes}` : '',
    '',
    p.text,
  ];
  return lines.filter((l) => l !== '').join('\n');
}

export const postsToText = (posts: ExtractedPost[], searches: SearchIndex = NO_SEARCHES) =>
  posts.map((p) => postToText(p, searches)).join('\n\n' + '-'.repeat(40) + '\n\n');

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function download(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

// WhatsApp posts: their own columns and text format, never mixed with LinkedIn rows.

export const WHATSAPP_CSV_COLUMNS = [
  'id',
  'chat',
  'chats',
  'sender',
  'senderPhone',
  'postedAt',
  'experience',
  'emails',
  'phones',
  'links',
  'matchedKeywords',
  'excludedBy',
  'status',
  'notes',
  'text',
  'timesSeen',
  'capturedAt',
  'lastSeenAt',
];

const chatsOf = (p: WhatsAppPost) => Array.from(new Set(p.sightings.map((s) => s.chat)));

export function whatsappToRow(p: WhatsAppPost): Record<string, unknown> {
  return {
    id: p.id,
    chat: p.chat,
    chats: chatsOf(p),
    sender: p.sender.name,
    senderPhone: p.sender.phone ?? '',
    postedAt: p.postedAt ?? '',
    experience: p.experience ? experienceLabel(p.experience) : '',
    emails: p.emails,
    phones: p.phones,
    links: p.links,
    matchedKeywords: p.matchedKeywords,
    excludedBy: p.excludedBy,
    status: p.status,
    notes: p.notes ?? '',
    text: p.text,
    timesSeen: p.sightings.length,
    capturedAt: p.capturedAt,
    lastSeenAt: p.lastSeenAt,
  };
}

export const whatsappToCsv = (posts: WhatsAppPost[]) => toCsv(posts.map(whatsappToRow), WHATSAPP_CSV_COLUMNS);
export const whatsappToJson = (posts: WhatsAppPost[]) => JSON.stringify(posts, null, 2);

/** Everything about one WhatsApp post as readable text, for notes or an email draft. */
export function whatsappToText(p: WhatsAppPost): string {
  const chats = chatsOf(p);
  const lines = [
    `Group: ${p.chat}${chats.length > 1 ? ` (also in ${chats.filter((c) => c !== p.chat).join(', ')})` : ''}`,
    `Sender: ${p.sender.name}${p.sender.phone && p.sender.phone !== normalizePhone(p.sender.name) ? ` (${formatPhone(p.sender.phone)})` : ''}`,
    `Posted: ${p.postedAt ? formatDate(p.postedAt) : 'unknown'}`,
    p.experience ? `Experience asked: ${experienceLabel(p.experience)}` : '',
    `Emails: ${p.emails.length ? p.emails.join(', ') : 'none'}`,
    p.phones.length ? `Phones: ${p.phones.map(formatPhone).join(', ')}` : '',
    p.links.length ? `Links: ${p.links.join(', ')}` : '',
    p.matchedKeywords.length ? `Keywords: ${p.matchedKeywords.join(', ')}` : '',
    `Seen: ${p.sightings.length} time(s), captured ${formatDate(p.capturedAt)}`,
    `Status: ${p.status}`,
    p.notes ? `Notes: ${p.notes}` : '',
    '',
    p.text,
  ];
  return lines.filter((l) => l !== '').join('\n');
}

export const whatsappListToText = (posts: WhatsAppPost[]) => posts.map(whatsappToText).join('\n\n' + '-'.repeat(40) + '\n\n');
