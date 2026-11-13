import { isJobPost } from '@shared/utils/jobtext';
import { locateScroller, findOlderButtons } from './page';
import { defaultDayFirst, detectDayFirst, findMessageElements, isReadMoreToggle, parseDataId, parseMessage, readChat } from './parse';
import { W } from './selectors';

/**
 * Structure report for the open WhatsApp chat, so selectors.ts can be fixed
 * without a browser. Contains NO message text, names or numbers: names are
 * masked (letters -> x, digits -> 9) and only counts, attribute names and
 * shapes are reported. Safe to paste into a chat with an agent.
 */
export interface WhatsAppDiagnoseReport {
  url: string;
  at: string;
  language: string;
  found: { main: boolean; header: boolean; chatTitleMasked: string | null; chatKind: 'group' | 'person' | 'unknown' };
  counts: Record<string, number>;
  /** Masked data-id shapes, e.g. "false_9@g.us_X_9@c.us". */
  dataIdFormats: string[];
  /** Masked stamp shapes, e.g. "[9:99 pm, 99/99/9999] <sender>: ". */
  prePlainFormats: string[];
  dayFirst: boolean;
  scroller: { how: string; scrollHeight?: number; clientHeight?: number; overflowY?: string };
  parsed: { messages: number; withText: number; withDate: number; jobPosts: number; withEmail: number; withPhone: number; withExperience: number };
  /** Tag/attribute outline of the newest incoming message, no text. */
  messageOutline: string[];
}

const mask = (s: string) => s.replace(/\p{Ll}/gu, 'x').replace(/\p{Lu}/gu, 'X').replace(/\d/g, '9');

function maskDataId(value: string): string {
  const id = parseDataId(value);
  if (!id) return mask(value).slice(0, 60);
  const shape = (jid: string) => jid.replace(/\d+/g, '9').replace(/^[^@]*[^\d@][^@]*@/, 'X@');
  return `${id.fromMe}_${shape(id.chatId)}_X${id.participant ? `_${shape(id.participant)}` : ''}`;
}

function maskStamp(value: string): string {
  const m = /^\s*\[([^\]]+)\]\s*([\s\S]*?):\s*$/.exec(value);
  if (!m) return `unrecognised (${value.length} chars)`;
  return `[${m[1]!.replace(/\d+/g, (d) => '9'.repeat(Math.min(d.length, 4)))}] <sender>: `;
}

function outline(root: Element, maxLines = 40, maxDepth = 9): string[] {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (lines.length >= maxLines || depth > maxDepth) return;
    const attrs = Array.from(el.attributes)
      .map((a) => a.name)
      .filter((n) => n !== 'class' && n !== 'style')
      .map((n) => (n === 'role' || n === 'dir' || n === 'data-icon' ? `${n}=${el.getAttribute(n)}` : n));
    const classes = el.classList.length;
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .reduce((sum, n) => sum + (n.textContent ?? '').trim().length, 0);
    const named = ['selectable-text', 'copyable-text', 'read-more-button', 'message-in', 'message-out', 'quoted-mention'].filter((c) =>
      el.classList.contains(c),
    );
    lines.push(
      `${'  '.repeat(depth)}${el.tagName.toLowerCase()}${attrs.length ? ` [${attrs.join(' ')}]` : ''}${classes ? ` .${classes}` : ''}${named.length ? ` (${named.join(' ')})` : ''}${ownText ? ` text:${ownText}` : ''}`,
    );
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines;
}

export function diagnoseWhatsApp(doc: Document = document): WhatsAppDiagnoseReport {
  const main = doc.querySelector(W.main);
  const messages = findMessageElements(doc);
  const ids = messages.map((m) => parseDataId(m.getAttribute('data-id'))).filter((x) => x !== null);
  const chat = readChat(doc);
  const dayFirst = detectDayFirst(messages, defaultDayFirst());
  const capturedAt = new Date().toISOString();
  const posts = messages.map((m) => parseMessage(m, { chat: 'x', dayFirst, capturedAt })).filter((p) => p !== null);
  const { el: scroller, how } = locateScroller(doc);
  const count = (sel: string) => main?.querySelectorAll(sel).length ?? 0;
  const newestIncoming = [...messages].reverse().find((m) => parseDataId(m.getAttribute('data-id'))?.fromMe === false);

  return {
    url: location.origin + location.pathname,
    at: capturedAt,
    language: typeof navigator === 'undefined' ? '' : navigator.language,
    found: {
      main: !!main,
      header: !!doc.querySelector(W.header),
      chatTitleMasked: chat.name ? mask(chat.name) : null,
      chatKind: chat.id ? (chat.id.endsWith('@g.us') ? 'group' : 'person') : 'unknown',
    },
    counts: {
      dataIdAttributes: count(W.messageCarrier),
      messages: messages.length,
      incoming: ids.filter((i) => !i.fromMe).length,
      outgoing: ids.filter((i) => i.fromMe).length,
      prePlainText: count(W.prePlain),
      ...Object.fromEntries(W.body.map((sel) => [`body:${sel}`, count(sel)])),
      readMoreToggles: Array.from(main?.querySelectorAll(W.readMoreCandidates) ?? []).filter(isReadMoreToggle).length,
      olderMessageButtons: findOlderButtons(doc).length,
      roleRow: count('[role="row"]'),
      roleApplication: count('[role="application"]'),
      quoted: count(W.quoted),
      forwardedIcons: count(W.forwarded),
      emojiImages: count('img[alt], img[data-plain-text]'),
      links: count('a[href]'),
    },
    dataIdFormats: Array.from(new Set(messages.slice(-30).map((m) => maskDataId(m.getAttribute('data-id') ?? '')))).slice(0, 5),
    prePlainFormats: Array.from(
      new Set(
        Array.from(main?.querySelectorAll(W.prePlain) ?? [])
          .slice(-30)
          .map((el) => maskStamp(el.getAttribute('data-pre-plain-text') ?? '')),
      ),
    ).slice(0, 5),
    dayFirst,
    scroller: scroller
      ? { how, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, overflowY: doc.defaultView?.getComputedStyle(scroller).overflowY }
      : { how },
    parsed: {
      messages: posts.length,
      withText: posts.filter((p) => p.text).length,
      withDate: posts.filter((p) => p.postedAt).length,
      jobPosts: posts.filter((p) => isJobPost(p.text)).length,
      withEmail: posts.filter((p) => p.emails.length).length,
      withPhone: posts.filter((p) => p.phones.length).length,
      withExperience: posts.filter((p) => p.experience).length,
    },
    messageOutline: newestIncoming ? outline(newestIncoming) : [],
  };
}
