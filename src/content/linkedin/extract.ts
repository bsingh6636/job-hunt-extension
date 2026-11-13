import type { ExtractMode, ExtractOptions, ExtractProgress, ExtractedPost } from '@shared/types';
import { pauseUnlessStopped, pickPause } from '@shared/utils/dom';
import { expandAll, scrollForMore } from './expand';
import { findPostCards, parsePostCard } from './parse';

export { pickPause };

/**
 * The extraction loop, without chrome.* calls so it runs in tests.
 * index.ts supplies `send` (store a batch) and `report` (progress to the panel).
 */

/** Posts sent from this page so far: id -> text length. Survives between runs until the page URL changes. */
export interface PageSession {
  url: string;
  sent: Map<string, number>;
}

export interface ExtractDeps {
  /** Store a batch; `pageUrl` is the search or feed page it came from. */
  send: (posts: ExtractedPost[], pageUrl: string) => Promise<number>;
  report: (progress: Omit<ExtractProgress, 'running'>) => Promise<void>;
  shouldStop: () => boolean;
  session: PageSession;
  /** Injected for tests. */
  random?: () => number;
}

/**
 * "fresh": capture up to `maxPosts` posts, starting from the top of what is loaded.
 * "more": capture the next `moreBatch` posts not already captured on this page,
 * so pressing More repeatedly walks down the results.
 * Every batch is sent (and stored) as soon as it is parsed. Between scrolls the
 * loop pauses a random `pauseMinMs`..`pauseMaxMs` so the pace looks like reading.
 */
export async function runExtraction(options: ExtractOptions, mode: ExtractMode, deps: ExtractDeps): Promise<void> {
  const { session, shouldStop, report } = deps;
  if (mode === 'fresh' || session.url !== location.href) {
    session.url = location.href;
    session.sent.clear();
  }
  const sourceUrl = location.href;
  const limit = mode === 'more' ? options.moreBatch : options.maxPosts;
  const done = new Set<string>(); // posts that count towards this run's limit
  let stored = 0;
  let idleRounds = 0;
  const status = (message: string, finished = false) =>
    report({ seen: done.size, sent: stored, message, ...(finished ? { done: true } : {}) });

  while (!shouldStop()) {
    if (options.expand) await expandAll();

    const cards = findPostCards();
    const batch: ExtractedPost[] = [];
    for (const card of cards) {
      const post = parsePostCard(card, { sourceUrl });
      if (!post) continue;
      const previous = session.sent.get(post.id);
      if (previous === undefined) {
        if (done.size >= limit) continue;
        done.add(post.id);
      } else if (post.text.length <= previous) {
        continue; // already sent, not expanded since
      }
      session.sent.set(post.id, post.text.length);
      batch.push(post);
    }

    if (batch.length > 0) {
      idleRounds = 0;
      stored += await deps.send(batch, sourceUrl);
    } else {
      idleRounds++;
    }

    if (done.size >= limit) {
      await status(`Captured ${done.size} of ${limit}. Press More for the next ${options.moreBatch}.`, true);
      return;
    }
    if (!options.scroll) {
      await status(`Captured ${done.size} (scrolling is off)`, true);
      return;
    }

    const wait = pickPause(options.pauseMinMs, options.pauseMaxMs, deps.random);
    await status(`Captured ${done.size} of ${limit}. Next scroll in ${Math.round(wait / 100) / 10} s`);
    await pauseUnlessStopped(wait, shouldStop);
    if (shouldStop()) break;

    const grew = await scrollForMore(options.scrollDelayMs, cards[cards.length - 1]);
    if (!grew && idleRounds >= 3) {
      await status(`Captured ${done.size} of ${limit}. No more posts loaded`, true);
      return;
    }
  }
  await status(`Stopped. Captured ${done.size} of ${limit}`, true);
}
