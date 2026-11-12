import { onMessage, sendToRuntime } from '@shared/messages';
import type { ExtractOptions, ExtractProgress, ExtractedPost } from '@shared/types';
import { log } from '@shared/utils/log';
import { diagnosePage } from './diagnose';
import { capturePageSample } from './sample';
import { expandAll, scrollForMore } from './expand';
import { findPostCards, parsePostCard } from './parse';

/**
 * LinkedIn content script. Does nothing until the side panel sends
 * LINKEDIN_EXTRACT_START; then it expands, scrolls and streams posts to the
 * background, which stores them. Runs only on the tab the user is looking at.
 */

let running = false;
let stopRequested = false;

async function report(progress: Omit<ExtractProgress, 'running'>) {
  try {
    await sendToRuntime('LINKEDIN_EXTRACT_PROGRESS', { progress: { running, ...progress } });
  } catch {
    // Side panel closed; nobody is listening. Fine.
  }
}

async function run(options: ExtractOptions): Promise<void> {
  running = true;
  stopRequested = false;
  const sourceUrl = location.href;
  /** id -> text length last sent; resend when the text grew (post expanded). */
  const sent = new Map<string, number>();
  let totalSent = 0;
  let idleRounds = 0;

  try {
    while (!stopRequested) {
      if (options.expand) await expandAll();

      const cards = findPostCards();
      const batch: ExtractedPost[] = [];
      for (const card of cards) {
        const post = parsePostCard(card, { sourceUrl });
        if (!post) continue;
        const previous = sent.get(post.id);
        if (previous === undefined || post.text.length > previous) {
          sent.set(post.id, post.text.length);
          batch.push(post);
        }
      }

      if (batch.length > 0) {
        idleRounds = 0;
        const res = await sendToRuntime('POSTS_CAPTURED', { posts: batch });
        totalSent += res?.stored ?? batch.length;
      } else {
        idleRounds++;
      }

      await report({ seen: sent.size, sent: totalSent, message: `Captured ${sent.size} posts on page` });

      if (sent.size >= options.maxPosts) {
        await report({ seen: sent.size, sent: totalSent, message: `Reached limit of ${options.maxPosts} posts`, done: true });
        break;
      }
      if (!options.scroll) {
        await report({ seen: sent.size, sent: totalSent, message: 'Done (scrolling disabled)', done: true });
        break;
      }
      const grew = await scrollForMore(options.scrollDelayMs, cards[cards.length - 1]);
      if (!grew && idleRounds >= 3) {
        await report({ seen: sent.size, sent: totalSent, message: 'No more posts loaded', done: true });
        break;
      }
    }
    if (stopRequested) await report({ seen: sent.size, sent: totalSent, message: 'Stopped', done: true });
  } catch (err) {
    log.error('extraction failed', err);
    await report({ seen: sent.size, sent: totalSent, message: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true });
  } finally {
    running = false;
  }
}

onMessage({
  PING: () => ({ ok: true, where: 'linkedin-content' }),
  LINKEDIN_STATUS: () => ({ running, postsOnPage: findPostCards().length }),
  LINKEDIN_DIAGNOSE: () => {
    const report = diagnosePage();
    log.info('diagnose', report);
    return report;
  },
  LINKEDIN_SAMPLE: ({ note }) => capturePageSample(document, note),
  LINKEDIN_EXTRACT_START: ({ options }) => {
    if (running) return { started: false, reason: 'Already running' };
    void run(options);
    return { started: true };
  },
  LINKEDIN_EXTRACT_STOP: () => {
    stopRequested = true;
    return { ok: true };
  },
});

log.debug('LinkedIn content script ready');
