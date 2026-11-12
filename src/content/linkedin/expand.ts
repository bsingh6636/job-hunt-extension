import { isVisible, sleep } from '@shared/utils/dom';
import { SEL, STRUCT } from './selectors';

/** Click every "...more" toggle that has not been clicked yet. Returns how many were clicked. */
export async function expandAll(root: ParentNode = document): Promise<number> {
  const scope: ParentNode =
    (root as Node).nodeType === Node.DOCUMENT_NODE ? ((root as Document).querySelector(STRUCT.scope) ?? (root as Document).body) : root;
  const toggles = new Set<HTMLElement>();
  for (const sel of SEL.seeMoreButtons) scope.querySelectorAll<HTMLElement>(sel).forEach((b) => toggles.add(b));
  // Fallback for renamed classes: any button whose text is a "more" toggle.
  scope.querySelectorAll<HTMLElement>('button').forEach((b) => {
    if (SEL.seeMoreTextPattern.test((b.textContent ?? '').trim())) toggles.add(b);
  });
  // Class-less markup: small non-button elements whose own text is a "more" toggle.
  // Walk deepest first so the innermost element gets the click (events bubble up, not down).
  const extra = Array.from(scope.querySelectorAll<HTMLElement>(STRUCT.moreToggleCandidates)).reverse();
  for (const el of extra) {
    if (el.children.length > 2) continue;
    const owner = el.closest('button, [role="button"]');
    if (owner && owner !== el) continue;
    if (!SEL.seeMoreTextPattern.test((el.textContent ?? '').replace(/\s+/g, ' ').trim())) continue;
    if (Array.from(toggles).some((t) => t.contains(el) || el.contains(t))) continue;
    toggles.add(el);
  }

  let clicked = 0;
  for (const toggle of toggles) {
    if (!isVisible(toggle) || toggle.dataset.jhExpanded === '1') continue;
    if (toggle.getAttribute('aria-expanded') === 'true') continue;
    toggle.dataset.jhExpanded = '1';
    toggle.click();
    clicked++;
    if (clicked % 10 === 0) await sleep(50);
  }
  if (clicked) await sleep(300);
  return clicked;
}

/** "Show more results" buttons: known selectors, else any button in <main> whose text or aria-label says so. */
export function findLoadMoreButtons(root: Document = document): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const sel of SEL.loadMoreButtons) root.querySelectorAll<HTMLElement>(sel).forEach((b) => found.add(b));
  const scope = root.querySelector(STRUCT.scope) ?? root.body;
  scope.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((b) => {
    const label = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
    if (SEL.loadMoreTextPattern.test(label)) found.add(b);
  });
  return Array.from(found).filter(isVisible);
}

/**
 * Scroll to the bottom, click any "Show more results" button and wait for
 * more content. Resolves true if new content appeared. Besides the window,
 * the last post is scrolled into view, which also scrolls an inner results
 * container if LinkedIn uses one. Growth is measured on the page height, the
 * <main> height and its link count, so an inner container that grows while
 * the page height stays fixed still counts.
 */
export async function scrollForMore(delayMs: number, lastCard?: Element): Promise<boolean> {
  const main = document.querySelector(STRUCT.scope);
  const size = () => document.body.scrollHeight + (main?.scrollHeight ?? 0) + (main?.querySelectorAll('a[href]').length ?? 0);
  const before = size();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' as ScrollBehavior });
  lastCard?.scrollIntoView?.({ block: 'end', behavior: 'instant' as ScrollBehavior });
  for (const button of findLoadMoreButtons()) button.click();
  const end = Date.now() + delayMs;
  while (Date.now() < end) {
    await sleep(150);
    if (size() > before) {
      await sleep(400); // let the batch render
      return true;
    }
  }
  return false;
}
