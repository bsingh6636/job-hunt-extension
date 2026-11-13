/**
 * Every WhatsApp Web selector and text pattern. Fix live breakage here.
 *
 * WhatsApp Web hashes its class names and removed most data-testid
 * attributes in 2023, so these rely on the few hooks that WhatsApp's own
 * copy/paste and accessibility keep stable:
 *
 * - `#main`: the open conversation; `#main header`: its title bar
 * - `data-id="false_<chat>@g.us_<msgId>_<sender>@c.us"` on each message
 *   (`true_` for messages you sent)
 * - `data-pre-plain-text="[2:48 pm, 13/11/2026] Sender: "` on the copyable
 *   block of each text message: time, date and sender in one attribute
 * - `span.selectable-text` for the message body
 *
 * Written from WhatsApp Web's known structure (2024-2026) and NOT yet
 * verified on a live page. Use the WhatsApp tab's Diagnose chat button to
 * see which of these match.
 */
export const W = {
  /** The open conversation panel. */
  main: '#main',
  header: '#main header',
  /** Chat name in the header, first element with usable text wins. */
  chatTitle: ['[data-testid="conversation-info-header-chat-title"]', 'span[dir="auto"]', 'span[title]'],
  /** Header texts that are not the chat name: member lists, presence, hints. */
  notTitle: /^(click here|tap here|online|typing|last seen|~?\s*you$)/i,

  /** Elements that carry a message id. The outermost one per message is used. */
  messageCarrier: '[data-id]',
  messageId: /^(true|false)_([^_]+@[^_]+)_([^_]+)(?:_(.+))?$/,

  /** Copyable block with "[time, date] Sender: ". */
  prePlain: '[data-pre-plain-text]',
  /** Message body, most specific first. */
  body: ['span.selectable-text.copyable-text', 'span.selectable-text', '.copyable-text span[dir="ltr"]', '.copyable-text span[dir="auto"]'],
  /** A quoted message inside a reply; its text belongs to another message. */
  quoted: '[aria-label*="Quoted"], [aria-label*="quoted"], .quoted-mention',
  /** "Forwarded" / "Forwarded many times" icon. */
  forwarded: '[data-icon*="forward"]',

  /** Where "Read more" toggles can be. Matched by text, innermost first. */
  readMoreCandidates: '.read-more-button, [role="button"], button, [data-pre-plain-text] span, [data-pre-plain-text] div',
  readMoreText: /^read more$/i,

  /** Buttons at the top of the history asking to fetch older messages from the phone. */
  olderMessagesText: /older messages|load earlier|get older/i,

  /** The scrolling message list when walking up from a message finds no scrollable box. */
  scrollerFallbacks: ['#main [data-tab="8"]', '#main .copyable-area > div[tabindex]', '#main [role="application"]'],
} as const;
