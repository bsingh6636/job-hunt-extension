import { SEL, STRUCT } from './selectors';
import { findPostCards, parsePostCard, readUrn } from './parse';
import { findCardsByStructure, labelOf } from './structure';

/**
 * Page diagnostic. Produces a privacy-safe description of what the page
 * looks like so selectors can be fixed without seeing the page: selector
 * hit counts, attribute inventories, and a structural outline (tags,
 * classes, data-* attributes, text LENGTHS) of the first post cards. Names
 * and text appear only masked ("Pxxxx Sxxxxx"), so the report can be pasted
 * into a chat. Triggered from the side panel's "Diagnose page" button.
 * For the real HTML use "Save page sample" (sample.ts) instead.
 */
export interface DiagnoseReport {
  url: string;
  at: string;
  /** Which findPostCards strategy produced cards: class selectors, URN attributes, page structure, or none. */
  strategy: 'class' | 'urn-attribute' | 'structure' | 'none';
  selectorCounts: Record<string, Record<string, number>>;
  genericProbes: Record<string, number>;
  /** Attribute name -> how many elements carry a post URN / a 19-digit id in it. */
  idAttributes: { urn: Record<string, number>; nineteenDigits: Record<string, number> };
  componentKeyShapes: Record<string, number>;
  testIds: Record<string, number>;
  roles: Record<string, number>;
  /** Distinct button labels (first word kept, the rest masked). */
  buttonLabels: Record<string, number>;
  /** Non-button elements whose text is a "more" toggle. */
  moreToggles: { tag: string; role: string | null; count: number }[];
  cardsFound: number;
  cards: { urn: string | null; parsed: Record<string, unknown> | null; outline: string[] }[];
  urnCarriers: { outline: string[] }[];
  moreButtons: string[];
}

const GENERIC_PROBES = [
  '[data-urn]',
  '[data-id]',
  '[data-view-name]',
  '[componentkey]',
  '[data-entity-urn]',
  '[data-testid]',
  'article',
  '[role="article"]',
  '[role="listitem"]',
  '[role="list"]',
  'li',
  '.feed-shared-update-v2',
  '[class*="update-components"]',
  '[class*="feed-shared"]',
  '[data-finite-scroll-hotkey-item]',
  'main',
  'a[href*="/in/"]',
  'a[href*="/company/"]',
  'a[href*="/feed/update/"]',
  'a[href*="/posts/"]',
  'button',
  '[role="button"]',
];

/** Keep capitals, digits and punctuation; hide lowercase letters. Enough to see structure and duplication, not content. */
export const mask = (s: string) => s.replace(/[a-zß-ÿ]/g, 'x');

const maskTail = (s: string) => {
  const [first = '', ...rest] = s.replace(/\s+/g, ' ').trim().split(' ');
  return [first, ...rest.map(mask)].join(' ').slice(0, 40);
};

function describe(el: Element): string {
  const parts = [el.tagName.toLowerCase()];
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 6);
  if (cls.length) parts.push('.' + cls.join('.'));
  for (const attr of Array.from(el.attributes)) {
    if (/^(aria-label|role|dir|componentkey|href|tabindex|aria-expanded|aria-hidden)$/.test(attr.name) || attr.name.startsWith('data-')) {
      let value = attr.value;
      if (attr.name === 'href') value = value.replace(/\?.*$/, '').replace(/\/(in|company|school)\/[^/?#]+/, '/$1/*').slice(0, 60);
      else if (attr.name === 'aria-label') value = maskTail(value);
      else value = value.slice(0, 80);
      parts.push(`[${attr.name}="${value}"]`);
    }
  }
  const text = (el.textContent ?? '').trim().length;
  if (text) parts.push(`{text:${text}}`);
  return parts.join('');
}

function outline(root: Element, maxDepth = 9, maxNodes = 220): string[] {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (lines.length >= maxNodes || depth > maxDepth) return;
    if (el.tagName === 'svg' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
      lines.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}`);
      return;
    }
    lines.push(`${'  '.repeat(depth)}${describe(el)}`);
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  };
  walk(root, 0);
  if (lines.length >= maxNodes) lines.push('... (truncated)');
  return lines;
}

function count(selector: string): number {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return -1;
  }
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function top(map: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n));
}

export function diagnosePage(): DiagnoseReport {
  const selectorCounts: Record<string, Record<string, number>> = {};
  for (const [group, value] of Object.entries(SEL)) {
    if (!Array.isArray(value)) continue;
    // urnAttributes are attribute names, not selectors.
    const asSelector = group === 'urnAttributes' ? (s: string) => `[${s}]` : (s: string) => s;
    selectorCounts[group] = Object.fromEntries((value as readonly string[]).map((s) => [s, count(asSelector(s))]));
  }
  const genericProbes = Object.fromEntries(GENERIC_PROBES.map((s) => [s, count(s)]));

  const idAttributes = { urn: {} as Record<string, number>, nineteenDigits: {} as Record<string, number> };
  const componentKeyShapes: Record<string, number> = {};
  const testIds: Record<string, number> = {};
  const roles: Record<string, number> = {};
  for (const el of Array.from(document.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (/urn:li:(activity|ugcPost|share):\d+/.test(attr.value)) bump(idAttributes.urn, attr.name);
      else if (/(?<!\d)\d{19}(?!\d)/.test(attr.value)) bump(idAttributes.nineteenDigits, attr.name);
    }
    const key = el.getAttribute('componentkey');
    if (key !== null) bump(componentKeyShapes, key.replace(/\d+/g, '#').replace(/[A-Za-z0-9_-]{24,}/g, '<long>').slice(0, 60));
    const testId = el.getAttribute('data-testid');
    if (testId !== null) bump(testIds, testId.slice(0, 60));
    const role = el.getAttribute('role');
    if (role !== null) bump(roles, role);
  }

  const scope = document.querySelector(STRUCT.scope) ?? document.body;
  const buttonLabels: Record<string, number> = {};
  scope.querySelectorAll('button, [role="button"]').forEach((b) => bump(buttonLabels, maskTail(labelOf(b))));
  const toggles: Record<string, { tag: string; role: string | null; count: number }> = {};
  scope.querySelectorAll<HTMLElement>(STRUCT.moreToggleCandidates).forEach((el) => {
    if (el.children.length > 2 || !SEL.seeMoreTextPattern.test((el.textContent ?? '').replace(/\s+/g, ' ').trim())) return;
    const k = `${el.tagName}|${el.getAttribute('role')}`;
    toggles[k] ??= { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), count: 0 };
    toggles[k].count++;
  });

  const cards = findPostCards();
  const byClass = SEL.postCard.some((s) => count(s) > 0);
  const byUrn = !byClass && cards.length > 0 && cards.some((c) => readUrn(c));
  const strategy: DiagnoseReport['strategy'] =
    cards.length === 0 ? 'none' : byClass ? 'class' : byUrn ? 'urn-attribute' : findCardsByStructure().length ? 'structure' : 'none';

  const cardReports = cards.slice(0, 2).map((card) => {
    const parsed = parsePostCard(card, { sourceUrl: location.href });
    const urn = readUrn(card);
    return {
      urn: urn ? `${urn.kind}:${urn.id}` : null,
      parsed: parsed
        ? {
            id: parsed.id.replace(/^(text:).*/, '$1<hash>'),
            urlKind: parsed.urlKind ?? null,
            authorName: mask(parsed.author.name),
            headline: parsed.author.headline ? mask(parsed.author.headline).slice(0, 60) : null,
            profileUrl: parsed.author.profileUrl ? parsed.author.profileUrl.replace(/\/(in|company|school)\/[^/?#]+/, '/$1/*') : null,
            textLength: parsed.text.length,
            textShape: mask(parsed.text.slice(0, 120)),
            emails: parsed.emails.length,
            links: parsed.links.length,
            postedAt: parsed.postedAt ?? null,
            postedAtApprox: parsed.postedAtApprox ?? false,
            postedAtLabel: parsed.postedAtLabel ?? null,
          }
        : null,
      outline: outline(card),
    };
  });

  // Elements carrying a post URN in any attribute, in case card selectors miss them.
  const urnCarriers: { outline: string[] }[] = [];
  if (cards.length === 0) {
    let n = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const hasUrn = Array.from(el.attributes).some((a) => /urn:li:(activity|ugcPost|share):\d+/.test(a.value));
      if (!hasUrn) continue;
      urnCarriers.push({ outline: outline(el, 4, 60) });
      if (++n >= 2) break;
    }
  }

  const moreButtons = Array.from(document.querySelectorAll('button'))
    .map((b) => (b.textContent ?? '').trim())
    .filter((t) => /more/i.test(t))
    .slice(0, 10);

  return {
    url: location.href,
    at: new Date().toISOString(),
    strategy,
    selectorCounts,
    genericProbes,
    idAttributes,
    componentKeyShapes: top(componentKeyShapes, 30),
    testIds: top(testIds, 40),
    roles,
    buttonLabels: top(buttonLabels, 40),
    moreToggles: Object.values(toggles),
    cardsFound: cards.length,
    cards: cardReports,
    urnCarriers,
    moreButtons,
  };
}
