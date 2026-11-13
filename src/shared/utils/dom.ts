/** DOM helpers shared by content scripts. No chrome.* usage here so they are unit-testable. */

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Random pause in [min, max] ms; min and max may be given in either order. */
export function pickPause(minMs: number, maxMs: number, random: () => number = Math.random): number {
  const lo = Math.max(0, Math.min(minMs, maxMs));
  const hi = Math.max(minMs, maxMs);
  return Math.round(lo + (hi - lo) * random());
}

/** Wait `ms`, checking `shouldStop` every 250 ms so Stop takes effect quickly. */
export async function pauseUnlessStopped(ms: number, shouldStop: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && !shouldStop()) await sleep(Math.min(250, end - Date.now()));
}

/** First element matching any selector in the list, in order. */
export function queryFirst<T extends Element = HTMLElement>(root: ParentNode, selectors: readonly string[]): T | null {
  for (const sel of selectors) {
    const el = root.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export function queryAllFirst<T extends Element = HTMLElement>(root: ParentNode, selectors: readonly string[]): T[] {
  for (const sel of selectors) {
    const list = root.querySelectorAll<T>(sel);
    if (list.length) return Array.from(list);
  }
  return [];
}

/**
 * Text content with line breaks preserved. innerText is not available in jsdom
 * and depends on layout, so this walks the tree and treats <br> and block
 * elements as newlines.
 */
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'BR', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

export function textWithBreaks(root: Node, skip?: (el: Element) => boolean): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (skip?.(el)) return;
    if (el.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const block = BLOCK_TAGS.has(el.tagName);
    if (block) parts.push('\n');
    el.childNodes.forEach(walk);
    if (block) parts.push('\n');
  };
  walk(root);
  return parts
    .join('')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** LinkedIn renders many labels twice ("Jane DoeJane Doe"); collapse that. */
export function collapseDoubled(text: string): string {
  const t = text.trim();
  if (t.length % 2 === 0) {
    const half = t.slice(0, t.length / 2);
    if (half === t.slice(t.length / 2)) return half;
  }
  const bySpace = t.split(/\s{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  if (bySpace.length === 2 && bySpace[0] === bySpace[1]) return bySpace[0]!;
  return t;
}

/** Wait until predicate returns a value, polling. Resolves null on timeout. */
export async function waitFor<T>(predicate: () => T | null | undefined, timeoutMs = 2000, intervalMs = 100): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

export function isVisible(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.hidden) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(html);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** CSS.escape with a fallback for environments that lack it (older jsdom). */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
