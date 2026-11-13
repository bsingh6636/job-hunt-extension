import type { WhatsAppPost, WhatsAppSighting } from '@shared/types';
import { extractEmails, extractUrlsFromText } from '@shared/utils/email';
import { hash64 } from '@shared/utils/hash';
import { parseExperience } from '@shared/utils/jobtext';
import { extractPhones, normalizePhone } from '@shared/utils/phone';
import { W } from './selectors';

/**
 * Pure DOM -> data for WhatsApp Web messages. No chrome.* calls, no clicks,
 * unit-tested against synthetic markup built from selectors.ts.
 */

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export interface DataId {
  fromMe: boolean;
  /** "120363...@g.us" for a group, "9198...@c.us" or "...@lid" for a person. */
  chatId: string;
  messageId: string;
  /** Sender in a group: "919876543210@c.us" or "123...@lid". */
  participant?: string;
}

/** "false_120363...@g.us_3EB0AB_919876543210@c.us" -> its parts. */
export function parseDataId(value: string | null | undefined): DataId | null {
  const m = W.messageId.exec(value ?? '');
  if (!m) return null;
  return { fromMe: m[1] === 'true', chatId: m[2]!, messageId: m[3]!, ...(m[4] ? { participant: m[4] } : {}) };
}

/** "919876543210@c.us" -> "+919876543210". LIDs ("...@lid") hide the number. */
export function participantPhone(participant: string | undefined): string | undefined {
  const m = /^(\d{8,15})@c\.us$/.exec(participant ?? '');
  return m ? `+${m[1]}` : undefined;
}

const STAMP_RE = /^\s*\[([^\]]+)\]\s*([\s\S]*?):\s*$/;
const DATE_RE = /(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/;
const TIME_RE = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(?:([ap])\.?\s?m\.?)?/i;

export interface Stamp {
  at?: Date;
  sender: string;
}

/**
 * "[2:48 pm, 13/11/2026] +91 80058 31972: " -> local time + sender. The date
 * order follows the browser locale, so `dayFirst` says whether 03/04 is
 * 3 April (India, UK) or March 4 (US). A 4-digit first part is year first.
 */
export function parsePrePlainText(raw: string, dayFirst = true): Stamp | null {
  const m = STAMP_RE.exec(raw);
  if (!m) return null;
  const stamp = m[1]!;
  const sender = m[2]!.trim();
  const d = DATE_RE.exec(stamp);
  const t = TIME_RE.exec(d ? stamp.replace(d[0], ' ') : stamp);
  if (!d || !t) return { sender };

  const [a, b, c] = [Number(d[1]), Number(d[2]), Number(d[3])];
  let year: number;
  let month: number;
  let day: number;
  if (d[1]!.length === 4) [year, month, day] = [a, b, c];
  else {
    year = c < 100 ? 2000 + c : c;
    if (a > 12) [day, month] = [a, b];
    else if (b > 12) [month, day] = [a, b];
    else if (dayFirst) [day, month] = [a, b];
    else [month, day] = [a, b];
  }
  let hour = Number(t[1]);
  const minute = Number(t[2]);
  const meridiem = t[3]?.toLowerCase();
  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return { sender };
  return { at: new Date(year, month - 1, day, hour, minute), sender };
}

/** Browser default: day first everywhere except US-style locales. */
export function defaultDayFirst(): boolean {
  return !/^en-(US|PH)\b/i.test(typeof navigator === 'undefined' ? '' : navigator.language);
}

/** Read the date order off the page: a first part above 12 means day first, a second part above 12 means month first. */
export function detectDayFirst(messages: Element[], fallback: boolean): boolean {
  for (const el of messages) {
    const stamp = STAMP_RE.exec(el.querySelector(W.prePlain)?.getAttribute('data-pre-plain-text') ?? '')?.[1];
    const d = stamp ? DATE_RE.exec(stamp) : null;
    if (!d || d[1]!.length === 4) continue;
    if (Number(d[1]) > 12) return true;
    if (Number(d[2]) > 12) return false;
  }
  return fallback;
}

function scopeOf(root: ParentNode): ParentNode | null {
  return (root as Node).nodeType === Node.DOCUMENT_NODE ? (root as Document).querySelector(W.main) : root;
}

const isMessageCarrier = (el: Element | null | undefined) => !!el && W.messageId.test(el.getAttribute('data-id') ?? '');

/** One element per message in the open chat, oldest first (document order). Empty when no chat is open. */
export function findMessageElements(root: ParentNode = document): HTMLElement[] {
  const scope = scopeOf(root);
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>(W.messageCarrier)).filter(
    (el) => isMessageCarrier(el) && !isMessageCarrier(el.parentElement?.closest(W.messageCarrier)),
  );
}

const usableTitle = (t: string) => !!t && t.length <= 100 && (t.match(/,/g)?.length ?? 0) < 3 && !W.notTitle.test(t);

/** Name of the open chat from the header, and its id from the first message. */
export function readChat(doc: Document = document): { name: string | null; id?: string } {
  const header = doc.querySelector(W.header);
  let name: string | null = null;
  for (const sel of W.chatTitle) {
    for (const el of Array.from(header?.querySelectorAll(sel) ?? [])) {
      const text = clean(el.textContent) || clean(el.getAttribute('title'));
      if (usableTitle(text)) {
        name = text;
        break;
      }
    }
    if (name) break;
  }
  const first = findMessageElements(doc)
    .map((el) => parseDataId(el.getAttribute('data-id')))
    .find(Boolean);
  return first ? { name, id: first.chatId } : { name };
}

export const isReadMoreToggle = (el: Element) => el.children.length <= 2 && W.readMoreText.test(clean(el.textContent));

/**
 * Text with line breaks preserved. WhatsApp draws emoji as <img alt="🔥">,
 * which textContent drops, so images contribute their alt text. "Read more"
 * toggles are skipped.
 */
export function messageText(root: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    if (el.tagName === 'IMG') {
      parts.push(el.getAttribute('data-plain-text') ?? el.getAttribute('alt') ?? '');
      return;
    }
    if (isReadMoreToggle(el)) return;
    const block = el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'LI';
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
    .replace(/\s*(?:…|\.\.\.)?\s*read more$/i, '')
    .trim();
}

/** The message body: the longest body span that is not inside a quoted reply. */
export function findBody(message: Element): Element | null {
  const scope = message.querySelector(W.prePlain) ?? message;
  for (const sel of W.body) {
    const found = Array.from(scope.querySelectorAll(sel)).filter((el) => !el.closest(W.quoted) && !el.parentElement?.closest(sel));
    if (found.length === 0) continue;
    return found.reduce((best, el) => ((el.textContent ?? '').length > (best.textContent ?? '').length ? el : best));
  }
  return null;
}

/**
 * Stable id from the text: the first 300 letters and digits, lower-cased.
 * The same post forwarded into five groups gets one id, and the id does
 * not change when "Read more" reveals the rest.
 */
export function whatsappContentId(text: string): string {
  const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 300) || text;
  return `wa:${hash64(key)}`;
}

const union = (...lists: string[][]) => Array.from(new Set(lists.flat()));

export interface MessageContext {
  chat: string;
  dayFirst: boolean;
  capturedAt: string;
}

/**
 * One message -> a WhatsAppPost with a single sighting. Returns null for
 * messages you sent, system notices ("X added Y"), and media without a
 * caption. Whether it is a job post is decided by the caller.
 */
export function parseMessage(el: Element, ctx: MessageContext): WhatsAppPost | null {
  const dataId = el.getAttribute('data-id') ?? '';
  const id = parseDataId(dataId);
  if (!id || id.fromMe) return null;
  const body = findBody(el);
  const text = body ? messageText(body) : '';
  if (!body || !text) return null;

  const stamp = parsePrePlainText(el.querySelector(W.prePlain)?.getAttribute('data-pre-plain-text') ?? '', ctx.dayFirst);
  const senderName = stamp?.sender || 'unknown';
  const senderPhone = participantPhone(id.participant) ?? normalizePhone(senderName);
  const postedAt = stamp?.at?.toISOString();

  const hrefs = Array.from(body.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '');
  const mailto = hrefs.filter((h) => /^mailto:/i.test(h)).map((h) => decodeURIComponent(h.slice(7).split('?')[0]!).toLowerCase());
  const tel = hrefs.filter((h) => /^tel:/i.test(h)).map((h) => normalizePhone(h.slice(4)) ?? '').filter(Boolean);
  const web = hrefs.filter((h) => /^https?:\/\//i.test(h));

  const sighting: WhatsAppSighting = {
    messageId: dataId,
    chat: ctx.chat,
    chatId: id.chatId,
    sender: senderName,
    ...(senderPhone ? { senderPhone } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(el.querySelector(W.forwarded) ? { forwarded: true } : {}),
  };
  const experience = parseExperience(text);
  return {
    id: whatsappContentId(text),
    text,
    emails: union(extractEmails(text), mailto),
    phones: union(extractPhones(text), tel),
    links: union(web, extractUrlsFromText(text)),
    ...(experience ? { experience } : {}),
    chat: ctx.chat,
    sender: senderPhone ? { name: senderName, phone: senderPhone } : { name: senderName },
    ...(postedAt ? { postedAt } : {}),
    sightings: [sighting],
    capturedAt: ctx.capturedAt,
    lastSeenAt: ctx.capturedAt,
    matchedKeywords: [],
    excludedBy: [],
    status: 'new',
  };
}
