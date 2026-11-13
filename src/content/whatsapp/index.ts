import { isErrorResponse, onMessage, sendToRuntime } from '@shared/messages';
import type { ExtractMode, ExtractProgress, WhatsAppExtractOptions } from '@shared/types';
import { log } from '@shared/utils/log';
import { diagnoseWhatsApp } from './diagnose';
import { runWhatsAppExtraction, type ChatSession } from './extract';
import { findMessageElements, readChat } from './parse';

/**
 * WhatsApp Web content script. Does nothing until the side panel sends
 * WHATSAPP_EXTRACT_START; then it reads the open chat, scrolls up for older
 * messages and streams job posts to the background, which stores them in
 * the whatsappPosts collection. It only reads: it never types or sends.
 * The loop itself is in extract.ts.
 */

let running = false;
let stopRequested = false;
/** What this chat has already sent, so "More" continues further back. */
const session: ChatSession = { chat: '', sent: new Map() };

async function report(progress: Omit<ExtractProgress, 'running'>) {
  try {
    await sendToRuntime('WHATSAPP_EXTRACT_PROGRESS', { progress: { running: !progress.done, ...progress } });
  } catch {
    // Side panel closed; nobody is listening. Fine.
  }
}

async function run(options: WhatsAppExtractOptions, mode: ExtractMode): Promise<void> {
  running = true;
  stopRequested = false;
  try {
    await runWhatsAppExtraction(options, mode, {
      session,
      shouldStop: () => stopRequested,
      report,
      send: async (posts) => {
        const res: unknown = await sendToRuntime('WHATSAPP_CAPTURED', { posts });
        // A failed store must stop the run, not be counted as stored.
        if (isErrorResponse(res)) throw new Error(`Could not store posts: ${res.error}`);
        return (res as { stored?: number } | undefined)?.stored ?? posts.length;
      },
    });
  } catch (err) {
    log.error('WhatsApp extraction failed', err);
    await report({ seen: 0, sent: 0, message: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true });
  } finally {
    running = false;
  }
}

onMessage({
  PING: () => ({ ok: true, where: 'whatsapp-content' }),
  WHATSAPP_STATUS: () => ({ running, chat: readChat().name, messagesOnPage: findMessageElements().length }),
  WHATSAPP_DIAGNOSE: () => {
    const report = diagnoseWhatsApp();
    log.info('WhatsApp diagnose', report);
    return report;
  },
  WHATSAPP_EXTRACT_START: ({ options, mode }) => {
    if (running) return { started: false, reason: 'Already running' };
    void run(options, mode ?? 'fresh');
    return { started: true };
  },
  WHATSAPP_EXTRACT_STOP: () => {
    stopRequested = true;
    return { ok: true };
  },
});

log.debug('WhatsApp content script ready');
