import type { Profile } from '@profile/profile.schema';
export type { Profile };

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
  /** The page the post was first captured from, usually the search URL. */
  sourceUrl: string;
  /** Every page (search) the post was captured from, oldest first. Missing on posts captured before 2026-11-13 = [sourceUrl]. */
  sourceUrls?: string[];
  /** Keywords from settings.keywords.include found in the text. */
  matchedKeywords: string[];
  /** Keywords from settings.keywords.exclude found in the text. */
  excludedBy: string[];
  status: PostStatus;
  notes?: string;
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
  /** When true the background drops posts with no include-keyword hit. */
  captureOnlyMatching: boolean;
  extract: ExtractOptions;
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
  autofill: { fillEmptyOnly: true, highlight: true },
  storage: { mode: 'server', serverUrl: 'http://127.0.0.1:4777' },
};
