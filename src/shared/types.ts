import type { Profile } from '@profile/profile.schema';
import type { ExperienceRange } from './utils/jobtext';
export type { Profile, ExperienceRange };

/** One LinkedIn post captured from the feed or a content search. */
export interface ExtractedPost {
  /** Stable id: "activity:7123...", "ugcPost:7123...", or "text:<hash>" when the page shows no post id. Used for dedupe. */
  id: string;
  url: string;
  /**
   * What `url` points at. "post": the post itself (URN found on the page).
   * "author-activity": the author's recent activity, because the page
   * exposed no post id (id is then "text:<hash>"). "search": the page it was
   * captured from. Missing on posts captured before 2026-11-13 = "post".
   */
  urlKind?: 'post' | 'author-activity' | 'search';
  author: {
    name: string;
    headline?: string;
    profileUrl?: string;
  };
  /** Full post body after "...more" expansion, newlines preserved. */
  text: string;
  emails: string[];
  links: string[];
  /** ISO timestamp decoded from the activity id (accurate to the ms), or estimated from the label when postedAtApprox. */
  postedAt?: string;
  /** True when postedAt was estimated from a relative label like "2d" (no post id on the page). */
  postedAtApprox?: boolean;
  /** LinkedIn relative label at capture time, e.g. "3d". */
  postedAtLabel?: string;
  /** First time an extraction saw this post. */
  capturedAt: string;
  /** Latest time an extraction saw this post. Missing on posts captured before 2026-11-13 = capturedAt. */
  lastSeenAt?: string;
  /**
   * Every page (search or feed) that showed the post, oldest first: ids of
   * `SearchPage`s in the `searches` collection, so the long URL is stored
   * once. [0] is where it was first captured. Read it with searchIdsOf(),
   * which also handles the legacy fields below.
   */
  searchIds?: string[];
  /** Legacy (posts stored before searchIds existed): the first page's URL. The next capture moves it into `searches`. */
  sourceUrl?: string;
  /** Legacy: every page's URL, oldest first. The next capture moves them into `searches`. */
  sourceUrls?: string[];
  /** Keywords from settings.keywords.include found in the text. */
  matchedKeywords: string[];
  /** Keywords from settings.keywords.exclude found in the text. */
  excludedBy: string[];
  status: PostStatus;
  notes?: string;
}

/**
 * A LinkedIn page posts were captured from (a content search or the feed),
 * stored once in the `searches` collection. Posts refer to it by id.
 */
export interface SearchPage {
  /** "search:<hash>" of `url` (searchIdOf in src/shared/searches.ts). */
  id: string;
  /** The page URL without per-visit params (sid, origin, ...). Opening it runs the search again. */
  url: string;
  /** The decoded search query, e.g. `"hiring" MERN NOT SENIOR`. Missing on the feed. */
  keywords?: string;
  /** First and latest time posts were captured from this page. */
  firstSeenAt: string;
  lastSeenAt: string;
}

export type PostStatus = 'new' | 'reviewed' | 'contacted' | 'ignored';
export const POST_STATUSES: PostStatus[] = ['new', 'reviewed', 'contacted', 'ignored'];

export interface ExtractOptions {
  /** Posts to capture when Extract is pressed. */
  maxPosts: number;
  /** Posts to capture each time More is pressed (continues where the last run stopped). */
  moreBatch: number;
  scroll: boolean;
  /** Longest wait for LinkedIn to render more posts after a scroll. */
  scrollDelayMs: number;
  /** Random pause between scrolls, so the pace looks like a person reading. */
  pauseMinMs: number;
  pauseMaxMs: number;
  expand: boolean;
}

/** "fresh" = Extract (from the top, up to maxPosts); "more" = More (next moreBatch not yet captured on this page). */
export type ExtractMode = 'fresh' | 'more';

/**
 * One job post seen in WhatsApp group chats (web.whatsapp.com). Stored in its
 * own `whatsappPosts` collection, never mixed with LinkedIn posts.
 */
export interface WhatsAppPost {
  /** "wa:<hash>" of the message text, so the same post forwarded to several groups is one row. */
  id: string;
  /** Full message text after "Read more", line breaks and emoji kept. */
  text: string;
  emails: string[];
  /** Phone numbers in the text as "+<country><number>", e.g. "+917087706624". */
  phones: string[];
  links: string[];
  /** Years of experience the post asks for, read from the text. Missing when it says nothing. */
  experience?: ExperienceRange;
  /** Group (chat) name of the earliest sighting. */
  chat: string;
  /** Sender of the earliest sighting: contact name, push name or phone as WhatsApp shows it. */
  sender: { name: string; phone?: string };
  /** Message time of the earliest sighting, from WhatsApp's "[2:48 pm, 13/11/2026]" stamp. */
  postedAt?: string;
  /** Every message that carried this text (group, sender, time), earliest first, at most 50. */
  sightings: WhatsAppSighting[];
  capturedAt: string;
  lastSeenAt: string;
  matchedKeywords: string[];
  excludedBy: string[];
  status: PostStatus;
  notes?: string;
}

export interface WhatsAppSighting {
  /** WhatsApp's own message id (the data-id attribute). */
  messageId: string;
  chat: string;
  /** "1203...@g.us" for groups. */
  chatId?: string;
  sender: string;
  senderPhone?: string;
  postedAt?: string;
  forwarded?: boolean;
}

export interface WhatsAppExtractOptions {
  /** Job posts to capture when Extract is pressed (other messages are read but not stored). */
  maxPosts: number;
  /** Job posts to capture each time More is pressed (continues further back in the chat). */
  moreBatch: number;
  /** Stop at messages older than this many days. 0 = no limit. */
  maxAgeDays: number;
  /** Store only messages that look like job posts (see isJobPost). Off = every text message. */
  onlyJobPosts: boolean;
  scroll: boolean;
  /** Longest wait for WhatsApp to load older messages after a scroll up. */
  scrollDelayMs: number;
  pauseMinMs: number;
  pauseMaxMs: number;
  /** Click "Read more" on long messages. */
  expand: boolean;
}

export interface ExtractProgress {
  running: boolean;
  seen: number;
  sent: number;
  message: string;
  done?: boolean;
}

/** A job application attempt, recorded when autofill runs or added by hand. */
export interface Application {
  id: string;
  company: string;
  title?: string;
  url: string;
  ats?: string;
  source: 'autofill' | 'manual';
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type ApplicationStatus = 'draft' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

/** What the autofill engine did on one page. */
export interface FillReport {
  adapter: string;
  url: string;
  ranAt: string;
  filled: FillResult[];
  skipped: FillResult[];
  unmatched: FillResult[];
  /** Form fields on the page no adapter spec claimed; input for AI matching. */
  unknownFields: UnknownField[];
}

export interface FillResult {
  key: string;
  label: string;
  value?: string;
  reason?: string;
}

export interface UnknownField {
  label: string;
  name?: string;
  id?: string;
  tag: string;
  type?: string;
  automationId?: string;
}

export interface Settings {
  keywords: { include: string[]; exclude: string[] };
  /** When true the background drops new LinkedIn and WhatsApp posts with no include-keyword hit. */
  captureOnlyMatching: boolean;
  extract: ExtractOptions;
  whatsapp: WhatsAppExtractOptions;
  autofill: { fillEmptyOnly: boolean; highlight: boolean };
  /**
   * Where posts, applications and fill reports live.
   * 'server' = the local SQLite server (server/index.mjs) on this laptop.
   * 'browser' = chrome.storage.local (no setup, but data stays inside Chrome).
   */
  storage: { mode: 'server' | 'browser'; serverUrl: string };
}

export const DEFAULT_SETTINGS: Settings = {
  keywords: {
    include: [
      'hiring',
      'node.js',
      'nodejs',
      'react',
      'full stack',
      'backend',
      'mern',
      'immediate joiner',
      'bengaluru',
      'bangalore',
    ],
    exclude: ['open to work', 'looking for a job'],
  },
  captureOnlyMatching: false,
  extract: { maxPosts: 200, moreBatch: 20, scroll: true, scrollDelayMs: 1500, pauseMinMs: 3000, pauseMaxMs: 7000, expand: true },
  whatsapp: {
    maxPosts: 100,
    moreBatch: 50,
    maxAgeDays: 30,
    onlyJobPosts: true,
    scroll: true,
    scrollDelayMs: 3000,
    pauseMinMs: 1500,
    pauseMaxMs: 4000,
    expand: true,
  },
  autofill: { fillEmptyOnly: true, highlight: true },
  storage: { mode: 'server', serverUrl: 'http://127.0.0.1:4777' },
};
