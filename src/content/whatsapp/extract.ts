import type { ExtractMode, ExtractProgress, WhatsAppExtractOptions, WhatsAppPost } from '@shared/types';
import { pauseUnlessStopped, pickPause } from '@shared/utils/dom';
import { isJobPost } from '@shared/utils/jobtext';
import { expandReadMore, loadOlder } from './page';
import { defaultDayFirst, detectDayFirst, findMessageElements, parseMessage, readChat } from './parse';

/**
 * The WhatsApp extraction loop, without chrome.* calls so it runs in tests.
 * It reads the open chat from the newest loaded message backwards, keeps
 * the messages that look like job posts, and scrolls up for older ones.
 * index.ts supplies `send` (store a batch) and `report` (progress to the panel).
 */

/** Messages sent from this chat so far: data-id -> text length. Reset when another chat is opened. */
export interface ChatSession {
  chat: string;
  sent: Map<string, number>;
}

export interface WhatsAppExtractDeps {
  send: (posts: WhatsAppPost[]) => Promise<number>;
  report: (progress: Omit<ExtractProgress, 'running'>) => Promise<void>;
  shouldStop: () => boolean;
  session: ChatSession;
  /** Injected for tests. */
  random?: () => number;
  now?: () => Date;
  loadOlder?: (delayMs: number) => Promise<boolean>;
}

const DAY_MS = 864e5;

/**
 * "fresh": capture up to `maxPosts` job posts, newest first.
 * "more": capture the next `moreBatch` job posts not yet captured from this
 * chat, so pressing More repeatedly walks back through the history.
 * Stops at the count, at messages older than `maxAgeDays`, when three
 * scrolls load nothing older, or on Stop. Each batch is stored as soon as
 * it is parsed.
 */
export async function runWhatsAppExtraction(options: WhatsAppExtractOptions, mode: ExtractMode, deps: WhatsAppExtractDeps): Promise<void> {
  const { session, shouldStop, report } = deps;
  const done = new Set<string>(); // job posts that count towards this run's limit
  let stored = 0;
  const status = (message: string, finished = false) =>
    report({ seen: done.size, sent: stored, message, ...(finished ? { done: true } : {}) });

  if (findMessageElements(document).length === 0) {
    await status('No messages found. Open a group chat in WhatsApp Web, then press Extract.', true);
    return;
  }
  const chat = readChat(document);
  const chatName = chat.name ?? 'Unknown chat';
  const key = chat.id ?? chatName;
  if (mode === 'fresh' || session.chat !== key) {
    session.chat = key;
    session.sent.clear();
  }

  const limit = mode === 'more' ? options.moreBatch : options.maxPosts;
  const now = deps.now?.() ?? new Date();
  const capturedAt = now.toISOString();
  const cutoff = options.maxAgeDays > 0 ? now.getTime() - options.maxAgeDays * DAY_MS : -Infinity;
  const loadMore = deps.loadOlder ?? ((ms: number) => loadOlder(ms));
  const read = new Set<string>(); // messages parsed in this run; each is parsed once unless "Read more" grows it
  let oldest: string | undefined;
  let stalls = 0;
  const summary = () => `${read.size} messages read${oldest ? `, back to ${new Date(oldest).toLocaleDateString()}` : ''}`;

  while (!shouldStop()) {
    const expanded = options.expand ? await expandReadMore(document) : [];
    for (const id of expanded) read.delete(id);

    const elements = findMessageElements(document);
    const dayFirst = detectDayFirst(elements, defaultDayFirst());
    const batch: WhatsAppPost[] = [];
    let pastCutoff = false;

    for (const el of [...elements].reverse()) {
      const dataId = el.getAttribute('data-id') ?? '';
      if (read.has(dataId)) continue;
      read.add(dataId);
      const post = parseMessage(el, { chat: chatName, dayFirst, capturedAt });
      if (!post) continue; // own message, system notice, media without caption
      if (post.postedAt) {
        if (!oldest || post.postedAt < oldest) oldest = post.postedAt;
        if (Date.parse(post.postedAt) < cutoff) {
          pastCutoff = true;
          continue;
        }
      }
      if (options.onlyJobPosts && !isJobPost(post.text)) continue;
      const previous = session.sent.get(dataId);
      if (previous === undefined) {
        if (done.size >= limit) continue;
        done.add(dataId);
      } else if (post.text.length <= previous) {
        continue; // sent by an earlier run, not expanded since
      }
      session.sent.set(dataId, post.text.length);
      batch.push(post);
    }

    if (batch.length > 0) stored += await deps.send(batch);

    if (done.size >= limit) {
      await status(`Captured ${done.size} of ${limit} job posts (${summary()}). Press More for the next ${options.moreBatch}.`, true);
      return;
    }
    if (pastCutoff) {
      await status(`Captured ${done.size} job posts. Reached messages older than ${options.maxAgeDays} days (${summary()}).`, true);
      return;
    }
    if (!options.scroll) {
      await status(`Captured ${done.size} job posts (${summary()}; scrolling is off)`, true);
      return;
    }

    const wait = pickPause(options.pauseMinMs, options.pauseMaxMs, deps.random);
    await status(`Captured ${done.size} of ${limit} job posts, ${summary()}. Loading older messages in ${Math.round(wait / 100) / 10} s`);
    await pauseUnlessStopped(wait, shouldStop);
    if (shouldStop()) break;

    stalls = (await loadMore(options.scrollDelayMs)) ? 0 : stalls + 1;
    if (stalls >= 3) {
      await status(
        `Captured ${done.size} of ${limit} job posts. No older messages loaded (${summary()}). If the chat shows a button to get older messages from your phone, click it and press More.`,
        true,
      );
      return;
    }
  }
  await status(`Stopped. Captured ${done.size} of ${limit} job posts (${summary()})`, true);
}
