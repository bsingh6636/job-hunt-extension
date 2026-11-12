/**
 * EVERY LinkedIn selector lives here and nowhere else. LinkedIn renames
 * classes regularly; when extraction breaks, fix this file only.
 *
 * Each entry is an ordered list of fallbacks; the first that matches wins.
 * Verified against the feed and content-search layouts current in late 2026.
 * The tests in tests/linkedin.parse.test.ts use a synthetic fixture built
 * from these same selectors, so they catch regressions in parse.ts, not in
 * LinkedIn itself.
 */

/**
 * LinkedIn's video player (video.js). Its control bar has dir="ltr" and
 * text like "Current Time 0:00 / Duration 0:42", so it must never count as
 * post text. Library classes, not LinkedIn's, so they survive redesigns.
 */
const MEDIA_PLAYER = '.video-js, [class*="vjs-"]';

export const SEL = {
  /** Outer container of one post. Must carry the activity/ugcPost URN. */
  postCard: [
    'div.feed-shared-update-v2[data-urn]',
    'div[data-urn^="urn:li:activity:"]',
    'div[data-urn^="urn:li:ugcPost:"]',
    'div[data-id^="urn:li:activity:"]',
    'div[data-id^="urn:li:ugcPost:"]',
    'div[data-urn*="urn:li:activity:"]',
    'div[data-id*="urn:li:activity:"]',
  ],
  /** Attributes that carry the URN on the card, in priority order. */
  urnAttributes: ['data-urn', 'data-id', 'data-activity-urn', 'data-entity-urn', 'componentkey'],
  /** Any element with one of these attributes is checked for a post URN when postCard finds nothing. */
  urnCarrierSelector: '[data-urn], [data-id], [data-activity-urn], [data-entity-urn], [componentkey]',

  /** Fallback text containers when `text` matches nothing: the longest wins. */
  textFallback: ['[class*="commentary"]', '[class*="break-words"]', '[class*="description"]', '[dir="ltr"]'],
  /** Fallback author anchor when `authorLink` matches nothing. */
  authorLinkFallback: ['a[href*="/in/"]', 'a[href*="/company/"]', 'a[href*="/school/"]'],
  /** Blocks that are never post text (actor header, social counts, comments, video player). */
  notText: ['[class*="actor"]', '[class*="social-"]', '[class*="comments-"]', '[class*="reactions"]', MEDIA_PLAYER],

  authorName: [
    '.update-components-actor__title span[aria-hidden="true"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.update-components-actor__title',
    '.update-components-actor__name',
  ],
  authorHeadline: [
    '.update-components-actor__description span[aria-hidden="true"]',
    '.update-components-actor__description',
  ],
  authorLink: [
    'a.update-components-actor__meta-link[href]',
    'a.update-components-actor__container-link[href]',
    '.update-components-actor__container a[href*="/in/"]',
    '.update-components-actor__container a[href*="/company/"]',
    '.update-components-actor a[href]',
  ],
  /** "3d • Edited •" style label. */
  postedLabel: [
    '.update-components-actor__sub-description span[aria-hidden="true"]',
    '.update-components-actor__sub-description',
    'time',
  ],

  /** The post body. */
  text: [
    '.update-components-text .break-words',
    '.update-components-text',
    '.feed-shared-update-v2__description .break-words',
    '.feed-shared-update-v2__description',
    '.update-components-update-v2__commentary',
    '.feed-shared-inline-show-more-text',
  ],
  /** Elements inside the body that are not post text. */
  textSkip: ['button', '[role="button"]', '.feed-shared-inline-show-more-text__see-more-less-toggle', '.visually-hidden', 'script', 'style'],

  /** Attachment cards whose links we also want. */
  attachmentLinks: ['.update-components-article a[href]', '.update-components-entity a[href]'],

  /** "...more" toggles inside a card. */
  seeMoreButtons: [
    'button.feed-shared-inline-show-more-text__see-more-less-toggle',
    '.feed-shared-inline-show-more-text button',
    'button[aria-label*="see more" i]',
  ],
  /** Fallback: any button whose visible text is a "more" toggle. */
  seeMoreTextPattern: /^(?:…|\.{3})?\s*(?:see\s+)?more\s*$/i,

  /** Bottom-of-list pagination button on search pages. */
  loadMoreButtons: ['button.scaffold-finite-scroll__load-button', 'button[aria-label="Show more results"]'],
  /** Fallback: any button inside <main> whose visible text or label is a "show more results" control. */
  loadMoreTextPattern: /^(?:show|see|load)\s+more\s+(?:results|posts)$/i,

  /** Nested reshare block; cards inside one are not separate posts. */
  nestedCard: ['.update-components-mini-update-v2'],
} as const;

/**
 * Structural fallback for LinkedIn's class-less markup (seen 2026-11-12 on
 * content search: no data-urn, no feed-shared/update-components classes,
 * only hashed classes and `componentkey` attributes). Used by structure.ts
 * only when every selector in SEL misses. Patterns, not class names.
 */
export const STRUCT = {
  /** Where to look for the list of posts. Falls back to <body>. */
  scope: 'main',
  /** A post header links to a person, company or school. */
  authorLink: 'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"]',
  /** Post body containers, if LinkedIn exposes test ids. The longest wins. */
  textCandidates: ['[data-testid="expandable-text-box"]', '[data-testid*="commentary" i]', '[data-testid*="text-box" i]'],
  /** Never part of the post body. */
  mediaPlayer: MEDIA_PLAYER,
  /** Social action buttons (matched on aria-label, else text). A post card has some. */
  socialButton: /^(?:react\s+)?(?:like|comment|repost|send)\b/i,
  /** The Like button; post body and attachments come before it, comments after. */
  likeButton: /^(?:react\s+)?like\b/i,
  /** Minimum text characters for a block to count as a post card. */
  minCardText: 60,
  /** A card needs this many social buttons, or `minButtons` buttons of any kind. */
  minSocialButtons: 1,
  minButtons: 3,
  /** "2d", "3w", "1mo", "1yr", "2 days ago", "Just now". */
  timeLabel: /^(?:(\d+)\s*(mo|yr|[smhdwy])\b|(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b|just now\b)/i,
  /** Header text that is not a name or headline. */
  headerNoise: /^[\s•·|]*(?:(?:1st|2nd|3rd\+?|\d+(?:st|nd|rd|th)\+?)(?:\s+degree connection)?|following|follow|verified|premium|promoted|edited|author|view (?:my|profile)\b.*|book an appointment|visit my website)?[\s•·|]*$/i,
  /** Clickable "more" toggles that are not <button> elements. */
  moreToggleCandidates: '[role="button"], span, div, a:not([href])',
} as const;

/** LinkedIn paths that wrap an external link in a `url` query parameter. */
export const REDIRECT_PATHS = ['/redir/redirect', '/safety/go'];

/**
 * URL patterns that are not content links: LinkedIn navigation, and words
 * LinkedIn auto-links in post text ("B.Tech" -> http://b.tech/, "Node.js").
 */
export const INTERNAL_LINK_PATTERNS = [
  /linkedin\.com\/in\//i,
  /linkedin\.com\/company\//i,
  /linkedin\.com\/school\//i,
  /linkedin\.com\/groups\//i,
  /linkedin\.com\/services\//i,
  /linkedin\.com\/feed\/hashtag/i,
  /linkedin\.com\/search\/results/i,
  /linkedin\.com\/feed\/update/i,
  /linkedin\.com\/posts\//i,
  /^https?:\/\/[^/?#]+\.js(?:[/?#]|$)/i,
  /^https?:\/\/[bm]\.(?:tech|e|sc|com|a|ca|ba|ed|des|arch|pharm)(?:[/?#]|$)/i,
  /^#/,
  /^javascript:/i,
];
