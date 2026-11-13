import { isErrorResponse, sendToTab, type MessageReq, type MessageRes, type MessageType } from '@shared/messages';

export const isLinkedInUrl = (url?: string) => !!url && /^https:\/\/www\.linkedin\.com\//i.test(url);
export const isWhatsAppUrl = (url?: string) => !!url && /^https:\/\/web\.whatsapp\.com\//i.test(url);
export const isAtsUrl = (url?: string) => !!url && /greenhouse\.io|lever\.co|myworkday(jobs|site)\.com/i.test(url);

/**
 * Send to a tab's content script, turning "Receiving end does not exist"
 * (page loaded before the extension was installed/reloaded) into a clear
 * message and surfacing handler errors.
 */
export async function askTab<K extends MessageType>(tabId: number, type: K, payload: MessageReq<K>): Promise<MessageRes<K>> {
  let res: unknown;
  try {
    res = await sendToTab(tabId, type, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/receiving end does not exist|could not establish connection/i.test(msg)) {
      throw new Error('The page has not loaded the extension script. Reload the tab and try again.');
    }
    throw err;
  }
  if (isErrorResponse(res)) throw new Error(res.error);
  return res as MessageRes<K>;
}

/** Best-effort company name from an ATS URL. */
export function companyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (/greenhouse\.io$/i.test(u.hostname)) return parts[0] ?? u.hostname;
    if (/lever\.co$/i.test(u.hostname)) return parts[0] ?? u.hostname;
    if (/myworkday(jobs|site)\.com$/i.test(u.hostname)) return u.hostname.split('.')[0] ?? u.hostname;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
