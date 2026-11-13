import { searchIdOf } from '@shared/searches';
import type { ExtractedPost } from '@shared/types';
import { collapseDoubled, queryFirst, textWithBreaks } from '@shared/utils/dom';
import { extractEmails, extractUrlsFromText } from '@shared/utils/email';
import { INTERNAL_LINK_PATTERNS, REDIRECT_PATHS, SEL } from './selectors';
import {
  authorActivityUrl,
  contentId,
  findAuthorAnchors,
  findAuthorStructural,
  findCardsByStructure,
  findLikeButton,
  findTextStructural,
  findTimeLabel,
  findUrnDeep,
  profileKey,
  relativeToDate,
  type Urn,
} from './structure';

/** Pure DOM -> data. No chrome.* calls so this runs in jsdom tests. */

export type { Urn };

export interface ParseContext {
  /** The page being parsed (search or feed). Resolves relative links; the post stores its searches id. */
  sourceUrl: string;
  now?: Date;
}

const URN_RE = /urn:li:(activity|ugcPost|share):(\d+)/;

/**
 * All top-level post cards on the page (nested reshares excluded).
 * Strategy 1: the known card selectors. Strategy 2: any element whose data
 * attributes carry a post URN, outermost only. Strategy 3 (class-less
 * markup): the repeating list of post-like blocks, see structure.ts.
 */
export function findPostCards(root: ParentNode = document): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  for (const sel of SEL.postCard) {
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => seen.add(el));
  }
  if (seen.size === 0) {
    root.querySelectorAll<HTMLElement>(SEL.urnCarrierSelector).forEach((el) => {
      if (readUrn(el)) seen.add(el);
    });
  }
  if (seen.size === 0) return findCardsByStructure(root);

  const cards = Array.from(seen);
  return cards.filter((card) => {
    let ancestor = card.parentElement;
    while (ancestor) {
      if (seen.has(ancestor)) return false;
      ancestor = ancestor.parentElement;
    }
    if (SEL.nestedCard.some((sel) => card.closest(sel))) return false;
    return true;
  });
}

export function readUrn(card: Element): Urn | null {
  for (const attr of SEL.urnAttributes) {
    const value = card.getAttribute(attr);
    if (!value) continue;
    const match = URN_RE.exec(value);
    if (match) return { kind: match[1] as Urn['kind'], id: match[2]! };
  }
  return null;
}

export function urnToUrl(urn: Urn): string {
  return `https://www.linkedin.com/feed/update/urn:li:${urn.kind}:${urn.id}/`;
}

/**
 * LinkedIn ids are Snowflake-like 63-bit numbers: the top 41 bits are a
 * millisecond timestamp. Shifting right by 22 recovers the post time.
 */
export function urnToDate(urn: Urn): Date | undefined {
  try {
    const ms = Number(BigInt(urn.id) >> 22n);
    const d = new Date(ms);
    const year = d.getUTCFullYear();
    if (year < 2010 || year > 2100) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function cleanUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    // LinkedIn wraps external links: /redir/redirect?url=<encoded>, /safety/go/?url=<encoded>
    if (/linkedin\.com$/i.test(url.hostname) && REDIRECT_PATHS.some((p) => url.pathname.startsWith(p))) {
      const target = url.searchParams.get('url');
      if (target) return cleanUrl(target, base);
    }
    url.hash = '';
    for (const key of ['trk', 'trackingId', 'lipi', 'licu', 'utm_source', 'utm_medium', 'utm_campaign']) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isInternal(url: string): boolean {
  return INTERNAL_LINK_PATTERNS.some((re) => re.test(url));
}

const skipInText = (el: Element) => SEL.textSkip.some((sel) => el.matches(sel));

/** The post body element from class selectors: known selectors first, then the longest plausible text block. */
export function findTextElement(card: HTMLElement): HTMLElement | null {
  const known = queryFirst(card, SEL.text);
  if (known) return known;
  const isExcluded = (el: Element) => SEL.notText.some((sel) => el.closest(sel));
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const sel of SEL.textFallback) {
    card.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (isExcluded(el)) return;
      const len = textWithBreaks(el, skipInText).length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    });
  }
  return best;
}

/** Author from class selectors (older markup). */
function findAuthorByClass(card: HTMLElement, base: string): ExtractedPost['author'] {
  const nameEl = queryFirst(card, SEL.authorName);
  const headlineEl = queryFirst(card, SEL.authorHeadline);
  const linkEl = queryFirst<HTMLAnchorElement>(card, SEL.authorLink) ?? queryFirst<HTMLAnchorElement>(card, SEL.authorLinkFallback);
  const name = nameEl ? collapseDoubled(textWithBreaks(nameEl)) : '';
  const headline = headlineEl ? collapseDoubled(textWithBreaks(headlineEl)) : undefined;
  const href = linkEl?.getAttribute('href');
  const profileUrl = href ? cleanUrl(href, base) ?? undefined : undefined;
  return { name, headline: headline || undefined, profileUrl };
}

export function parsePostCard(card: HTMLElement, ctx: ParseContext): ExtractedPost | null {
  const now = ctx.now ?? new Date();
  const urn = readUrn(card) ?? findUrnDeep(card);

  // Time label: class selectors, else the first "2d"-style text in the card.
  const labelEl = queryFirst(card, SEL.postedLabel);
  const time = labelEl ? null : findTimeLabel(card);
  const postedAtLabel = labelEl ? collapseDoubled(textWithBreaks(labelEl)).split('•')[0]?.trim() : time?.label;

  // Body: class selectors, else the longest text-only block between the header and the Like button.
  const byClass = !!queryFirst(card, SEL.authorName);
  const authorAnchors = byClass ? [] : findAuthorAnchors(card).anchors;
  const likeEl = findLikeButton(card);
  const textEl =
    findTextElement(card) ?? findTextStructural(card, { after: time?.el ?? null, before: likeEl, exclude: authorAnchors });
  const text = textEl ? textWithBreaks(textEl, skipInText) : '';

  const author = byClass
    ? findAuthorByClass(card, ctx.sourceUrl)
    : (({ name, headline, profileUrl }) => ({ name, headline, profileUrl }))(findAuthorStructural(card, [time?.el ?? null, textEl]));

  if (!urn && !text && !author.name) return null;

  // Links: anchors in the body + attachments + bare URLs in the text.
  const links = new Set<string>();
  const emails = new Set<string>(extractEmails(text));
  const anchorRoots: ParentNode[] = textEl ? [textEl] : [];
  const attachments = SEL.attachmentLinks.flatMap((sel) => Array.from(card.querySelectorAll(sel)));
  if (attachments.length) {
    for (const a of attachments) anchorRoots.push(a.parentElement ?? a);
  } else if (!byClass) {
    // Class-less markup: every link above the Like button that is not the author header.
    card.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      if (authorAnchors.includes(a)) return;
      if (likeEl && !(a.compareDocumentPosition(likeEl) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      anchorRoots.push(a);
    });
  }
  for (const root of anchorRoots) {
    const anchors = root instanceof HTMLAnchorElement ? [root] : Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? '';
      if (href.toLowerCase().startsWith('mailto:')) {
        const email = href.slice(7).split('?')[0]?.trim().toLowerCase();
        if (email) emails.add(email);
        continue;
      }
      const url = cleanUrl(href, ctx.sourceUrl);
      if (url && !isInternal(url)) links.add(url);
    }
  }
  for (const url of extractUrlsFromText(text)) if (!isInternal(url)) links.add(url);

  // Identity: the URN when the page has one, else a content hash and the author's activity page.
  let id: string;
  let url: string;
  let urlKind: ExtractedPost['urlKind'];
  let postedAt: string | undefined;
  let postedAtApprox = false;
  if (urn) {
    id = `${urn.kind}:${urn.id}`;
    url = urnToUrl(urn);
    urlKind = 'post';
    postedAt = urnToDate(urn)?.toISOString();
  } else {
    const key = profileKey(author.profileUrl);
    id = contentId(key || author.name, text || (card.textContent ?? ''));
    const activity = authorActivityUrl(key);
    url = activity ?? ctx.sourceUrl;
    urlKind = activity ? 'author-activity' : 'search';
  }
  if (!postedAt && postedAtLabel) {
    const approx = relativeToDate(postedAtLabel, now);
    if (approx) {
      postedAt = approx.toISOString();
      postedAtApprox = true;
    }
  }

  return {
    id,
    url,
    urlKind,
    author,
    text,
    emails: [...emails],
    links: [...links],
    postedAt,
    postedAtApprox: postedAtApprox || undefined,
    postedAtLabel: postedAtLabel || undefined,
    capturedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    searchIds: [searchIdOf(ctx.sourceUrl)],
    matchedKeywords: [],
    excludedBy: [],
    status: 'new',
  };
}
