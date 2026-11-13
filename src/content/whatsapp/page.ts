import { isVisible, sleep } from '@shared/utils/dom';
import { findMessageElements, isReadMoreToggle } from './parse';
import { W } from './selectors';

/**
 * The only code that acts on the WhatsApp page: clicks "Read more" and
 * scrolls the message list up. It never types, sends or opens anything,
 * and it adds no attributes to WhatsApp's DOM (clicked toggles are
 * remembered in a WeakSet instead).
 */

const clicked = new WeakSet<Element>();
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Click every "Read more" not clicked yet, innermost element first. Returns the data-id of each expanded message. */
export async function expandReadMore(doc: Document = document): Promise<string[]> {
  const scope = doc.querySelector(W.main);
  if (!scope) return [];
  const chosen: HTMLElement[] = [];
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>(W.readMoreCandidates)).reverse()) {
    if (clicked.has(el) || !isReadMoreToggle(el)) continue;
    if (chosen.some((c) => el.contains(c))) continue; // its inner element is already queued
    chosen.push(el);
  }
  const ids: string[] = [];
  for (const el of chosen) {
    // Read the id first: the click may remove the toggle from the page.
    const id = el.closest(W.messageCarrier)?.getAttribute('data-id');
    clicked.add(el);
    el.click();
    if (id) ids.push(id);
  }
  if (chosen.length) await sleep(300);
  return ids;
}

/** "Click to get older messages from your phone" style buttons inside the chat. */
export function findOlderButtons(doc: Document = document): HTMLElement[] {
  const scope = doc.querySelector(W.main);
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(
    (b) => b.children.length <= 3 && W.olderMessagesText.test(clean(b.getAttribute('aria-label') || b.textContent)) && isVisible(b),
  );
}

/** The scrolling message list: the first scrollable ancestor of a message, else a known container. */
export function locateScroller(doc: Document = document): { el: HTMLElement | null; how: 'scrollable-ancestor' | 'fallback' | 'none' } {
  const view = doc.defaultView;
  for (let el = findMessageElements(doc)[0]?.parentElement ?? null; el && el !== doc.body; el = el.parentElement) {
    const overflow = view?.getComputedStyle(el).overflowY ?? '';
    if (/(auto|scroll)/.test(overflow) && el.scrollHeight > el.clientHeight + 4) return { el, how: 'scrollable-ancestor' };
  }
  for (const sel of W.scrollerFallbacks) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el) return { el, how: 'fallback' };
  }
  return { el: null, how: 'none' };
}

const signature = (doc: Document) => {
  const messages = findMessageElements(doc);
  return `${messages.length}|${messages[0]?.getAttribute('data-id') ?? ''}`;
};

/**
 * Scroll the message list to the top so WhatsApp loads older messages, and
 * wait up to `delayMs` for them. Resolves true when the oldest loaded
 * message changed or the count grew.
 */
export async function loadOlder(delayMs: number, doc: Document = document): Promise<boolean> {
  const before = signature(doc);
  for (const button of findOlderButtons(doc)) button.click();
  const { el: scroller } = locateScroller(doc);
  if (scroller) {
    // Nudge down then up, so WhatsApp sees a scroll event even when the list already sits at the top.
    scroller.scrollTop = Math.min(300, scroller.scrollHeight);
    await sleep(60);
    scroller.scrollTop = 0;
  } else {
    findMessageElements(doc)[0]?.scrollIntoView?.({ block: 'start' });
  }
  const end = Date.now() + delayMs;
  while (Date.now() < end) {
    await sleep(200);
    if (signature(doc) !== before) {
      await sleep(500); // let the batch render
      return true;
    }
  }
  return false;
}
