/**
 * Full page sample for fixing selectors offline. Unlike diagnose.ts this
 * DOES include page text: the whole document's HTML. The side panel sends it
 * to the local server (POST /samples), which saves it under
 * server/data/samples/ and serves it back for viewing with scripts blocked.
 * If the server is down the panel downloads it instead. It never leaves the
 * laptop.
 *
 * Besides the HTML it records every place a post id appears (attributes,
 * links, inline scripts), because the newer LinkedIn markup no longer puts
 * the post URN on the card in an obvious attribute.
 */
export interface PageSampleMeta {
  kind: 'linkedin-page-sample';
  version: 2;
  url: string;
  title: string;
  at: string;
  /** Free text typed in the panel before saving (e.g. copied post links). */
  note: string;
  viewport: { width: number; height: number; scrollY: number; scrollHeight: number };
  idScan: {
    /** Elements whose attributes contain a post-id-like value. */
    attributes: { tag: string; attr: string; value: string }[];
    attributeTotal: number;
    /** Links that point at a post. */
    postLinks: string[];
    /** Matches inside inline <script> and <code> blocks. */
    scriptMatches: number;
    scriptContexts: string[];
  };
  componentKeys: { tag: string; value: string; children: number; textLength: number }[];
  testIds: Record<string, number>;
  roles: Record<string, number>;
  buttons: { text: string; ariaLabel: string | null; ariaExpanded: string | null }[];
  counts: { elements: number; scripts: number; mainElements: number };
}

export interface PageSample extends PageSampleMeta {
  /** The whole document, scripts neutralised, <base> pointing at linkedin.com. */
  html: string;
  htmlBytes: number;
}

/** URN forms, "activity-<id>" in /posts/ permalinks, and any 19-digit run (current activity ids), even glued to letters. */
const ID_RE = /urn:li:(?:activity|ugcPost|share|fsd_update|fs_updateV2|fsd_socialDetail|fsd_socialActivityCounts)[:(][^"'\s<>]{0,160}|activity-\d{15,20}|(?<!\d)\d{19}(?!\d)/g;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function scanIds(doc: Document): PageSampleMeta['idScan'] {
  const attributes: PageSampleMeta['idScan']['attributes'] = [];
  let attributeTotal = 0;
  const postLinks = new Set<string>();

  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      ID_RE.lastIndex = 0;
      if (!ID_RE.test(attr.value)) continue;
      attributeTotal++;
      if (attributes.length < 150) attributes.push({ tag: el.tagName.toLowerCase(), attr: attr.name, value: cut(attr.value, 240) });
    }
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href') ?? '';
      if (/\/feed\/update\/|\/posts\/|urn:li:(activity|ugcPost|share)/.test(href) && postLinks.size < 60) postLinks.add(cut(href, 240));
    }
  }

  let scriptMatches = 0;
  const scriptContexts: string[] = [];
  for (const block of Array.from(doc.querySelectorAll('script, code'))) {
    const text = block.textContent ?? '';
    if (!text) continue;
    ID_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ID_RE.exec(text))) {
      scriptMatches++;
      if (scriptContexts.length < 25) {
        const from = Math.max(0, match.index - 100);
        scriptContexts.push(`<${block.tagName.toLowerCase()}> …${text.slice(from, match.index + match[0].length + 100)}…`);
      }
    }
  }
  return { attributes, attributeTotal, postLinks: [...postLinks], scriptMatches, scriptContexts };
}

const DATA_SCRIPT_TYPES = /^(application\/(ld\+)?json|text\/plain|text\/template)$/i;

/**
 * The whole document as HTML, safe to open from the local server:
 * executable scripts become inert text (content kept for analysis),
 * iframes are blanked, a <base> makes relative links and images resolve
 * against linkedin.com, and CSRF-style meta tags are dropped.
 */
export function fullPageHtml(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script').forEach((script) => {
    const type = script.getAttribute('type') ?? '';
    if (DATA_SCRIPT_TYPES.test(type)) return;
    script.setAttribute('data-original-type', type || 'text/javascript');
    script.setAttribute('type', 'text/x-jobhunt-disabled');
    const src = script.getAttribute('src');
    if (src) {
      script.setAttribute('data-original-src', src);
      script.removeAttribute('src');
    }
  });
  clone.querySelectorAll('iframe').forEach((frame) => {
    const src = frame.getAttribute('src');
    if (src) frame.setAttribute('data-original-src', src);
    frame.setAttribute('src', 'about:blank');
  });
  clone.querySelectorAll('meta[name*="csrf" i], meta[name*="token" i]').forEach((meta) => meta.remove());
  clone.querySelectorAll('base').forEach((base) => base.remove());

  let head = clone.querySelector('head');
  if (!head) {
    head = doc.createElement('head');
    clone.insertBefore(head, clone.firstChild);
  }
  const base = doc.createElement('base');
  base.setAttribute('href', 'https://www.linkedin.com/');
  head.insertBefore(base, head.firstChild);
  const marker = doc.createComment(` Job Hunt page sample of ${doc.location?.href ?? ''} at ${new Date().toISOString()}. Scripts disabled. `);
  head.insertBefore(marker, head.firstChild);

  return `<!DOCTYPE html>\n${clone.outerHTML}`;
}

export function capturePageSample(doc: Document = document, note = ''): PageSample {
  const componentKeys: PageSampleMeta['componentKeys'] = [];
  const seenKeys = new Set<string>();
  doc.querySelectorAll('[componentkey]').forEach((el) => {
    const value = el.getAttribute('componentkey') ?? '';
    const shape = value.replace(/\d+/g, '#');
    if (seenKeys.has(shape) && componentKeys.length > 20) return;
    seenKeys.add(shape);
    if (componentKeys.length < 80) {
      componentKeys.push({
        tag: el.tagName.toLowerCase(),
        value: cut(value, 200),
        children: el.children.length,
        textLength: (el.textContent ?? '').trim().length,
      });
    }
  });

  const testIds: Record<string, number> = {};
  doc.querySelectorAll('[data-testid]').forEach((el) => bump(testIds, el.getAttribute('data-testid') ?? ''));
  const roles: Record<string, number> = {};
  doc.querySelectorAll('[role]').forEach((el) => bump(roles, el.getAttribute('role') ?? ''));

  const buttons = Array.from(doc.querySelectorAll('button, [role="button"]'))
    .map((b) => ({
      text: cut((b.textContent ?? '').replace(/\s+/g, ' ').trim(), 60),
      ariaLabel: b.getAttribute('aria-label'),
      ariaExpanded: b.getAttribute('aria-expanded'),
    }))
    .slice(0, 200);

  const html = fullPageHtml(doc);
  const win = doc.defaultView;

  return {
    kind: 'linkedin-page-sample',
    version: 2,
    url: doc.location?.href ?? '',
    title: doc.title,
    at: new Date().toISOString(),
    note,
    viewport: {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
      scrollY: win?.scrollY ?? 0,
      scrollHeight: doc.body.scrollHeight,
    },
    idScan: scanIds(doc),
    componentKeys,
    testIds,
    roles,
    buttons,
    counts: {
      elements: doc.querySelectorAll('*').length,
      scripts: doc.querySelectorAll('script').length,
      mainElements: doc.querySelector('main')?.querySelectorAll('*').length ?? 0,
    },
    html,
    htmlBytes: html.length,
  };
}
