import { collapseDoubled } from '@shared/utils/dom';
import { SEL, STRUCT } from './selectors';

/**
 * Class-free post detection for LinkedIn's newer markup, where cards carry
 * no data-urn and only hashed class names. Everything here works from page
 * structure: a repeating list of blocks that each contain an author link,
 * text, and social buttons. Pure DOM, no chrome.* calls, unit-tested.
 * parse.ts uses these only when the class-based selectors in SEL miss.
 */

export interface Urn {
  kind: 'activity' | 'ugcPost' | 'share';
  id: string;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Accessible label of a control: aria-label first, else its text. */
export const labelOf = (el: Element) => clean(el.getAttribute('aria-label')) || clean(el.textContent);

const BUTTONS = 'button, [role="button"]';

function depthOf(el: Element): number {
  let depth = 0;
  for (let p = el.parentElement; p; p = p.parentElement) depth++;
  return depth;
}

function scopeOf(root: ParentNode): Element | null {
  if ((root as Node).nodeType === Node.DOCUMENT_NODE) {
    const doc = root as Document;
    return doc.querySelector(STRUCT.scope) ?? doc.body;
  }
  return root as Element;
}

/** Author link + enough text + social buttons. */
export function isPostLike(el: Element): boolean {
  if (clean(el.textContent).length < STRUCT.minCardText) return false;
  if (!el.querySelector(STRUCT.authorLink)) return false;
  const buttons = Array.from(el.querySelectorAll(BUTTONS));
  const social = buttons.filter((b) => STRUCT.socialButton.test(labelOf(b))).length;
  return social >= STRUCT.minSocialButtons || buttons.length >= STRUCT.minButtons;
}

/**
 * Find the list(s) whose children are post-like, and return those children.
 * Every ancestor of an author link is a candidate list. The candidate with
 * the most post-like children wins (deeper wins a tie); further lists are
 * kept if they do not overlap one already chosen, so results loaded in
 * separate chunks are all found. Comment lists inside a card overlap the
 * feed list and are dropped.
 */
export function findCardsByStructure(root: ParentNode = document): HTMLElement[] {
  const scope = scopeOf(root);
  if (!scope) return [];

  const memo = new Map<Element, boolean>();
  const postLike = (el: Element) => {
    let value = memo.get(el);
    if (value === undefined) {
      value = isPostLike(el);
      memo.set(el, value);
    }
    return value;
  };

  const lists = new Set<Element>();
  scope.querySelectorAll(STRUCT.authorLink).forEach((a) => {
    for (let p = a.parentElement; p; p = p.parentElement) {
      lists.add(p);
      if (p === scope) break;
    }
  });

  const scored = Array.from(lists)
    .map((list) => ({ list, items: Array.from(list.children).filter(postLike), depth: depthOf(list) }))
    .filter((s) => s.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length || b.depth - a.depth);

  const chosen: typeof scored = [];
  for (const s of scored) {
    if (chosen.some((c) => c.list.contains(s.list) || s.list.contains(c.list))) continue;
    chosen.push(s);
  }

  const cards = chosen.flatMap((c) => c.items) as HTMLElement[];
  return cards.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

const URN_ANY = /urn:li:(activity|ugcPost|share):(\d{10,20})/;
const PERMALINK_ID = /activity-(\d{15,20})/;

/** `urn%3Ali%3Aactivity%3A…` in link query strings -> `urn:li:activity:…`. */
function decoded(value: string): string {
  if (!/%3a/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * First post URN in any attribute of the card or its descendants (plain or
 * URL-encoded, e.g. a group link's highlightedUpdateUrn), or in a /posts/
 * permalink.
 */
export function findUrnDeep(card: Element): Urn | null {
  const elements = [card, ...Array.from(card.querySelectorAll('*'))];
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      const urn = URN_ANY.exec(attr.value) ?? URN_ANY.exec(decoded(attr.value));
      if (urn) return { kind: urn[1] as Urn['kind'], id: urn[2]! };
      if (attr.name === 'href' && attr.value.includes('/posts/')) {
        const permalink = PERMALINK_ID.exec(attr.value);
        if (permalink) return { kind: 'activity', id: permalink[1]! };
      }
    }
  }
  return null;
}

interface Segment {
  text: string;
  el: Element;
}

/** Visible text runs in document order, one per parent element, skipping buttons. */
function segments(root: Element): Segment[] {
  const out: Segment[] = [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(`${BUTTONS}, script, style`)) continue;
    const raw = node.textContent ?? '';
    if (!raw.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.el === parent) last.text += raw;
    else out.push({ text: raw, el: parent });
  }
  for (const s of out) s.text = clean(s.text);
  return out;
}

/** The "2d • Edited" label in the card header, if any. */
export function findTimeLabel(card: Element): { el: Element; label: string } | null {
  for (const seg of segments(card)) {
    if (STRUCT.timeLabel.test(seg.text)) return { el: seg.el, label: clean(seg.text.split(/[•·]/)[0]) };
  }
  return null;
}

/** "2d" -> now minus two days. Approximate by nature. */
export function relativeToDate(label: string, now: Date): Date | undefined {
  const match = STRUCT.timeLabel.exec(clean(label));
  if (!match) return undefined;
  if (/^just now/i.test(clean(label))) return now;
  const amount = Number(match[1] ?? match[3]);
  const unit = (match[2] ?? match[4] ?? '').toLowerCase();
  const ms: Record<string, number> = {
    s: 1e3, second: 1e3,
    m: 6e4, minute: 6e4,
    h: 36e5, hour: 36e5,
    d: 864e5, day: 864e5,
    w: 6048e5, week: 6048e5,
    mo: 2592e6, month: 2592e6,
    y: 31536e6, yr: 31536e6, year: 31536e6,
  };
  const unitMs = ms[unit];
  return unitMs && Number.isFinite(amount) ? new Date(now.getTime() - amount * unitMs) : undefined;
}

/** First Like button in the card: body and attachments are above it, comments below. */
export function findLikeButton(card: Element): Element | null {
  return Array.from(card.querySelectorAll(BUTTONS)).find((b) => STRUCT.likeButton.test(labelOf(b))) ?? null;
}

/** "/in/jane-doe" for any profile, company or school link. */
export function profileKey(href: string | null | undefined): string {
  if (!href) return '';
  try {
    return new URL(href, 'https://www.linkedin.com').pathname.toLowerCase().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export interface StructuralAuthor {
  name: string;
  headline?: string;
  profileUrl?: string;
  /** Every anchor in the card that points at the author; never post text. */
  anchors: Element[];
}

const isNoise = (text: string) => !text || STRUCT.headerNoise.test(text);

/** Every anchor in the card that points at the same profile as the first profile/company/school link. */
export function findAuthorAnchors(card: Element): { key: string; anchors: Element[] } {
  const links = Array.from(card.querySelectorAll<HTMLAnchorElement>(STRUCT.authorLink));
  const first = links[0];
  if (!first) return { key: '', anchors: [] };
  const key = profileKey(first.getAttribute('href'));
  return { key, anchors: links.filter((a) => profileKey(a.getAttribute('href')) === key) };
}

/** True when `el` is `stop`, inside it, or after it in document order. */
function reached(el: Element, stop: Element): boolean {
  return el === stop || stop.contains(el) || !!(stop.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * Author from the first profile/company link in the card. The headline is
 * the first non-noise header line after the name, before any `stops`
 * element (the time label and the post body).
 */
export function findAuthorStructural(card: Element, stops: (Element | null)[]): StructuralAuthor {
  const { key, anchors } = findAuthorAnchors(card);
  if (!anchors.length) return { name: '', anchors: [] };

  let name = '';
  for (const a of anchors) {
    const seg = segments(a).find((s) => !isNoise(s.text));
    if (seg) {
      name = collapseDoubled(seg.text.split(/\s[•·]\s/)[0] ?? '');
      break;
    }
  }
  if (!name) {
    for (const a of anchors) {
      const match = /^view\s+(.+?)['’]s?\s/i.exec(a.getAttribute('aria-label') ?? '');
      if (match) {
        name = match[1]!;
        break;
      }
    }
  }

  let headline: string | undefined;
  const bounds = stops.filter((x): x is Element => !!x);
  const all = segments(card);
  const nameAt = name ? all.findIndex((s) => s.text === name || s.text.startsWith(name)) : -1;
  if (nameAt >= 0) {
    for (const seg of all.slice(nameAt + 1)) {
      if (bounds.some((stop) => reached(seg.el, stop))) break;
      if (isNoise(seg.text) || seg.text === name || STRUCT.timeLabel.test(seg.text)) continue;
      headline = collapseDoubled(seg.text);
      break;
    }
  }

  const profileUrl = key ? `https://www.linkedin.com${key}/` : undefined;
  return { name, headline, profileUrl, anchors };
}

const INLINE_TAGS = new Set(['A', 'SPAN', 'BR', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'SMALL', 'MARK', 'CODE', 'SUB', 'SUP', 'WBR', 'ABBR', 'TIME', 'LABEL']);
const BLOCK_TEXT_TAGS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * The post body: a test-id container if LinkedIn exposes one, else the
 * longest block made only of text markup (no images, no buttons other than
 * a "more" toggle) that sits after the header's time label, before the Like
 * button, and outside the author links.
 */
export function findTextStructural(card: Element, opts: { after: Element | null; before: Element | null; exclude: Element[] }): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const sel of STRUCT.textCandidates) {
    card.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const len = clean(el.textContent).length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    });
  }
  if (best) return best;

  const memo = new Map<Element, boolean>();
  const textual = (el: Element): boolean => {
    const known = memo.get(el);
    if (known !== undefined) return known;
    let ok = true;
    for (const child of Array.from(el.children)) {
      if (child.matches(BUTTONS)) {
        if (SEL.seeMoreTextPattern.test(clean(child.textContent))) continue;
        ok = false;
      } else if (!INLINE_TAGS.has(child.tagName) && !BLOCK_TEXT_TAGS.has(child.tagName)) {
        ok = false;
      } else if (!textual(child)) {
        ok = false;
      }
      if (!ok) break;
    }
    memo.set(el, ok);
    return ok;
  };

  const { after, before, exclude } = opts;
  for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
    if (!INLINE_TAGS.has(el.tagName) && !BLOCK_TEXT_TAGS.has(el.tagName)) continue;
    if (el.closest(STRUCT.mediaPlayer)) continue;
    if (exclude.some((x) => x === el || x.contains(el) || el.contains(x))) continue;
    if (after && (after === el || after.contains(el) || el.contains(after) || !(after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
    if (before && (el.contains(before) || !(el.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
    if (!textual(el)) continue;
    const len = clean(el.textContent).length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  return best;
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Stable id when the page exposes no post URN: author + the first 40
 * letters/digits of the text. The prefix is the same before and after
 * "...more" expansion, so a post keeps its id as its text grows.
 */
export function contentId(authorKey: string, text: string): string {
  const prefix = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
  const key = `${authorKey.toLowerCase()}|${prefix}`;
  return `text:${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x9e3779b9)}`;
}

/** Best link when the post URL is unknown: the author's activity page. */
export function authorActivityUrl(key: string): string | undefined {
  if (key.startsWith('/in/')) return `https://www.linkedin.com${key}/recent-activity/all/`;
  if (key.startsWith('/company/')) return `https://www.linkedin.com${key}/posts/`;
  return undefined;
}
