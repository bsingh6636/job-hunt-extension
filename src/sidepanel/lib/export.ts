import type { ExtractedPost } from '@shared/types';
import { toCsv } from '@shared/utils/csv';

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

export function postToRow(p: ExtractedPost): Record<string, unknown> {
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
    sourceUrl: p.sourceUrl,
    sourceUrls: p.sourceUrls ?? [p.sourceUrl],
  };
}

export const postsToCsv = (posts: ExtractedPost[]) => toCsv(posts.map(postToRow), POST_CSV_COLUMNS);
export const postsToJson = (posts: ExtractedPost[]) => JSON.stringify(posts, null, 2);

/** Everything about one post as readable text, for pasting into notes or an email draft. */
export function postToText(p: ExtractedPost): string {
  const lines = [
    `Author: ${p.author.name}${p.author.headline ? ` - ${p.author.headline}` : ''}`,
    p.author.profileUrl ? `Profile: ${p.author.profileUrl}` : '',
    `${p.urlKind === 'author-activity' ? "Post (author's activity page; post link not on the page)" : 'Post'}: ${p.url}`,
    `Posted: ${p.postedAt ? `${p.postedAtApprox ? 'about ' : ''}${formatDate(p.postedAt)}` : 'unknown'}${p.postedAtLabel ? ` (${p.postedAtLabel})` : ''}`,
    `Captured: ${formatDate(p.capturedAt)}${p.lastSeenAt && p.lastSeenAt !== p.capturedAt ? `, last seen ${formatDate(p.lastSeenAt)}` : ''}`,
    `Found via: ${(p.sourceUrls ?? [p.sourceUrl]).join(' , ')}`,
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

export const postsToText = (posts: ExtractedPost[]) => posts.map(postToText).join('\n\n' + '-'.repeat(40) + '\n\n');

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
