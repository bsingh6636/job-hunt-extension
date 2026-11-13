import type { ExtractMode, ExtractOptions, ExtractProgress, ExtractedPost, FillReport, Profile, WhatsAppExtractOptions, WhatsAppPost } from './types';
import type { DiagnoseReport } from '../content/linkedin/diagnose';
import type { PageSample } from '../content/linkedin/sample';
import type { WhatsAppDiagnoseReport } from '../content/whatsapp/diagnose';

/**
 * Every message the extension sends, with its request payload and response.
 * Adding a message = adding a key here; the helpers below keep senders and
 * handlers in sync at compile time.
 */
export interface MessageMap {
  PING: { req: Record<string, never>; res: { ok: true; where: string } };

  // Side panel -> LinkedIn content script
  LINKEDIN_EXTRACT_START: { req: { options: ExtractOptions; mode?: ExtractMode }; res: { started: boolean; reason?: string } };
  LINKEDIN_EXTRACT_STOP: { req: Record<string, never>; res: { ok: true } };
  LINKEDIN_STATUS: { req: Record<string, never>; res: { running: boolean; postsOnPage: number } };
  /** Structural description of the page for fixing selectors; see content/linkedin/diagnose.ts. */
  LINKEDIN_DIAGNOSE: { req: Record<string, never>; res: DiagnoseReport };
  /** Full sanitized HTML of <main> plus every post-id location; downloaded locally only. See content/linkedin/sample.ts. */
  LINKEDIN_SAMPLE: { req: { note: string }; res: PageSample };

  // Any writer -> everyone: a collection changed (used when storage is the server, which cannot push).
  DATA_CHANGED: { req: { collection: string }; res: void };

  // LinkedIn content script -> background / side panel (broadcast)
  LINKEDIN_EXTRACT_PROGRESS: { req: { progress: ExtractProgress }; res: void };
  /** `pageUrl` is the search/feed page the batch came from; the background stores it once in `searches`. */
  POSTS_CAPTURED: { req: { posts: ExtractedPost[]; pageUrl: string }; res: { stored: number; dropped: number } };

  // Side panel -> WhatsApp content script (web.whatsapp.com)
  WHATSAPP_EXTRACT_START: { req: { options: WhatsAppExtractOptions; mode?: ExtractMode }; res: { started: boolean; reason?: string } };
  WHATSAPP_EXTRACT_STOP: { req: Record<string, never>; res: { ok: true } };
  /** Which chat is open and how many messages are loaded. */
  WHATSAPP_STATUS: { req: Record<string, never>; res: { running: boolean; chat: string | null; messagesOnPage: number } };
  /** Structural description of the open chat for fixing selectors (no message text); see content/whatsapp/diagnose.ts. */
  WHATSAPP_DIAGNOSE: { req: Record<string, never>; res: WhatsAppDiagnoseReport };

  // WhatsApp content script -> background / side panel (broadcast)
  WHATSAPP_EXTRACT_PROGRESS: { req: { progress: ExtractProgress }; res: void };
  WHATSAPP_CAPTURED: { req: { posts: WhatsAppPost[] }; res: { stored: number; dropped: number } };

  // Side panel -> autofill content script
  AUTOFILL_DETECT: { req: Record<string, never>; res: { adapter: string | null; fieldsOnPage: number } };
  AUTOFILL_RUN: { req: { profile: Profile; fillEmptyOnly: boolean; highlight: boolean }; res: FillReport };
}

export type MessageType = keyof MessageMap;
export type MessageReq<K extends MessageType> = MessageMap[K]['req'];
export type MessageRes<K extends MessageType> = MessageMap[K]['res'];
export type Envelope<K extends MessageType = MessageType> = { type: K; payload: MessageReq<K> };

type Handler<K extends MessageType> = (
  payload: MessageReq<K>,
  sender: chrome.runtime.MessageSender,
) => MessageRes<K> | Promise<MessageRes<K>>;

export type Handlers = Partial<{ [K in MessageType]: Handler<K> }>;

/** Send to the extension runtime (background + any open extension pages). */
export function sendToRuntime<K extends MessageType>(type: K, payload: MessageReq<K>): Promise<MessageRes<K>> {
  const envelope: Envelope<K> = { type, payload };
  return chrome.runtime.sendMessage(envelope) as Promise<MessageRes<K>>;
}

/** Send to the content script(s) in one tab. */
export function sendToTab<K extends MessageType>(
  tabId: number,
  type: K,
  payload: MessageReq<K>,
): Promise<MessageRes<K>> {
  const envelope: Envelope<K> = { type, payload };
  return chrome.tabs.sendMessage(tabId, envelope) as Promise<MessageRes<K>>;
}

/**
 * Register handlers. Only messages with a registered handler are answered, so
 * several listeners (background, side panel) can coexist without stealing
 * each other's responses.
 */
export function onMessage(handlers: Handlers): () => void {
  const listener = (
    raw: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | undefined => {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return undefined;
    const { type, payload } = raw as Envelope;
    const handler = handlers[type] as Handler<typeof type> | undefined;
    if (!handler) return undefined;
    Promise.resolve()
      .then(() => handler(payload as never, sender))
      .then((res) => sendResponse(res))
      .catch((err: unknown) => {
        console.error(`[messages] handler for ${type} failed`, err);
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      });
    return true; // keep the channel open for the async response
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export function isErrorResponse(res: unknown): res is { error: string } {
  return !!res && typeof res === 'object' && 'error' in res;
}
