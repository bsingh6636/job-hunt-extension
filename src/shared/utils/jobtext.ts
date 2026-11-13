import { extractEmails } from './email';
import { extractPhones } from './phone';

/**
 * Plain-text heuristics for job posts written by recruiters in chat groups:
 * is this message a job post at all, and how many years of experience does
 * it ask for. Pure functions, no DOM.
 */

/** Each pattern counts once. A job post usually hits four or more; chat ("ok thanks", "good morning") hits none. */
const JOB_SIGNALS: RegExp[] = [
  /\bhiring\b|\brecruit/i,
  /\bjobs?\b|\bopenings?\b|\bvacanc(?:y|ies)\b|\bpositions?\b/i,
  /\broles?\b|\bdesignation\b|\bjob title\b/i,
  /\bexp(?:erience)?\b|\b\d{1,2}\s*\+?\s*(?:years?|yrs?)\b/i,
  /\bctc\b|\blpa\b|\bsalary\b|\bstipend\b|\bpackage\b/i,
  /\bapply\b|\bcv\b|\bresume\b|\bjd\b/i,
  /\bwalk[- ]?in\b|\binterview\b|\bnotice period\b|\bimmediate joiners?\b/i,
  /\blocation\b|\bremote\b|\bwfh\b|\bwfo\b|\bwork from (?:home|office)\b|\bhybrid\b|\bon-?site\b/i,
  /\bfull[- ]?time\b|\bpart[- ]?time\b|\bcontract\b|\binternship\b|\bfreshers?\b|\bfte\b/i,
  /\bdeveloper\b|\bengineer\b|\barchitect\b|\banalyst\b|\bdesigner\b|\btester\b|\bintern\b/i,
  /\bskills?\b|\brequirements?\b|\bresponsibilit(?:y|ies)\b|\bqualifications?\b/i,
];

/** How many job signals the text hits; an email or a phone number count as one each. */
export function jobSignalCount(text: string): number {
  let hits = JOB_SIGNALS.filter((re) => re.test(text)).length;
  if (extractEmails(text).length > 0) hits++;
  if (extractPhones(text).length > 0) hits++;
  return hits;
}

/** At least 40 characters and three job signals. Short referral questions and greetings fail. */
export function isJobPost(text: string): boolean {
  return text.trim().length >= 40 && jobSignalCount(text) >= 3;
}

export interface ExperienceRange {
  /** Fewest years any role in the post asks for. 0 for freshers. */
  min: number;
  /** Most years, when every range in the post has an upper end ("6 to 7 years"). Missing for "8+ years". */
  max?: number;
}

/** 1-2 digit number, optionally with one decimal, not part of a longer number ("2026", "18" read as "1"). */
const NUM = String.raw`(?<![\d.])(\d{1,2}(?:\.\d)?)(?!\.?\d)`;
const UNIT = String.raw`(?:years?|yrs?)\b`;
const NOT_MONTHS = String.raw`(?!\s*(?:months?|mos?)\b)`;
/** "Experience: 8+", "Exp - 2-4 yrs", "Minimum experience of 3 years": the number right after the word. */
const LEAD_RE = new RegExp(
  String.raw`\b(?:exp(?:erience)?|yoe)\b[\s:\-–—=.*]*(?:(?:of|required|req|min(?:imum)?|at ?least|needed)\s*[:\-–]?\s*)?` +
    String.raw`${NUM}\s*(?:(\+)|(?:-|–|—|to)\s*${NUM})?\s*\+?${NOT_MONTHS}`,
  'gi',
);
/** "6 to 10 years", "2-4 yrs" anywhere. */
const RANGE_RE = new RegExp(String.raw`${NUM}\s*\+?\s*(?:-|–|—|to)\s*${NUM}\s*\+?\s*${UNIT}`, 'gi');
/** "8+ years", "5 + yrs". */
const PLUS_RE = new RegExp(String.raw`${NUM}\s*\+\s*${UNIT}`, 'gi');
/** "2 years". */
const SINGLE_RE = new RegExp(String.raw`${NUM}\s*${UNIT}`, 'gi');

interface Hit {
  start: number;
  end: number;
  min: number;
  max?: number;
}

/**
 * Years of experience the post asks for. Several roles in one post give the
 * lowest minimum, so a fit filter errs towards showing a post. Numbers after
 * the word "experience" count even without "years"; elsewhere they need
 * "years"/"yrs" so CTC figures and durations in months are ignored.
 */
export function parseExperience(text: string): ExperienceRange | undefined {
  const hits: Hit[] = [];
  const add = (m: RegExpMatchArray, min: string | undefined, max: string | undefined) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (hits.some((h) => start < h.end && end > h.start)) return; // already read as part of a longer match
    const lo = Number(min);
    const hi = max === undefined ? undefined : Number(max);
    if (!Number.isFinite(lo) || lo > 30 || (hi !== undefined && (hi < lo || hi > 40))) return;
    hits.push({ start, end, min: lo, max: hi });
  };
  for (const m of text.matchAll(LEAD_RE)) add(m, m[1], m[2] ? undefined : (m[3] ?? m[1]));
  for (const m of text.matchAll(RANGE_RE)) add(m, m[1], m[2]);
  for (const m of text.matchAll(PLUS_RE)) add(m, m[1], undefined);
  for (const m of text.matchAll(SINGLE_RE)) add(m, m[1], m[1]);

  if (hits.length === 0) return /\bfreshers?\b/i.test(text) ? { min: 0, max: 0 } : undefined;
  const min = Math.min(...hits.map((h) => h.min));
  const max = hits.every((h) => h.max !== undefined) ? Math.max(...hits.map((h) => h.max!)) : undefined;
  return max === undefined ? { min } : { min, max };
}

/** { min: 6, max: 7 } -> "6-7 yrs"; { min: 8 } -> "8+ yrs"; { min: 0, max: 0 } -> "fresher". */
export function experienceLabel(range: ExperienceRange): string {
  if (range.max === undefined) return `${range.min}+ yrs`;
  if (range.max === 0) return 'fresher';
  return range.min === range.max ? `${range.min} yrs` : `${range.min}-${range.max} yrs`;
}

/** A post fits when it states no experience or asks for at most `years` as its minimum. */
export function fitsExperience(range: ExperienceRange | undefined, years: number): boolean {
  return !range || range.min <= years;
}
