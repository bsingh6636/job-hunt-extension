import { onMessage, sendToRuntime } from '@shared/messages';
import type { ExtractMode, ExtractOptions, ExtractProgress } from '@shared/types';
import { log } from '@shared/utils/log';
import { diagnosePage } from './diagnose';
import { runExtraction, type PageSession } from './extract';
import { capturePageSample } from './sample';
import { findPostCards } from './parse';

/**
 * LinkedIn content script. Does nothing until the side panel sends
 * LINKEDIN_EXTRACT_START; then it expands, scrolls and streams posts to the
 * background, which stores them. Runs only on the tab the user is looking at.
 * The loop itself is in extract.ts.
 */

let running = false;
let stopRequested = false;
/** What this page has already sent, so "More" continues where the last run stopped. */
const session: PageSession = { url: '', sent: new Map() };

async function report(progress: Omit<ExtractProgress, 'running'>) {
  try {
    await sendToRuntime('LINKEDIN_EXTRACT_PROGRESS', { progress: { running: !progress.done, ...progress } });
  } catch {
    // Side panel closed; nobody is listening. Fine.
  }
}

async function run(options: ExtractOptions, mode: ExtractMode): Promise<void> {
  running = true;
  stopRequested = false;
  try {
    await runExtraction(options, mode, {
      session,
      shouldStop: () => stopRequested,
      report,
      send: async (posts) => (await sendToRuntime('POSTS_CAPTURED', { posts }))?.stored ?? posts.length,
    });
  } catch (err) {
    log.error('extraction failed', err);
    await report({ seen: 0, sent: 0, message: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true });
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
  LINKEDIN_EXTRACT_START: ({ options, mode }) => {
    if (running) return { started: false, reason: 'Already running' };
    void run(options, mode ?? 'fresh');
    return { started: true };
  },
  LINKEDIN_EXTRACT_STOP: () => {
    stopRequested = true;
    return { ok: true };
  },
});

log.debug('LinkedIn content script ready');
