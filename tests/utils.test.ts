import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/shared/utils/csv';
import { collapseDoubled } from '../src/shared/utils/dom';
import { deobfuscate, extractEmails, extractUrlsFromText } from '../src/shared/utils/email';
import { matchKeywords, parseKeywordList } from '../src/shared/utils/keywords';
import { mergePost } from '../src/shared/posts';
import type { ExtractedPost } from '../src/shared/types';

describe('email extraction', () => {
  it('finds plain emails and strips trailing punctuation', () => {
    expect(extractEmails('Mail me at Jane.Doe@Example.com. Or hr@acme.co.in,')).toEqual(['jane.doe@example.com', 'hr@acme.co.in']);
  });
  it('handles [at] / (dot) obfuscation', () => {
    expect(deobfuscate('jane [at] example [dot] com')).toBe('jane@example.com');
    expect(extractEmails('reach out: jane (at) example (dot) com')).toEqual(['jane@example.com']);
    expect(extractEmails('jane at example dot com')).toEqual(['jane@example.com']);
  });
  it('ignores image names', () => {
    expect(extractEmails('logo@2x.png')).toEqual([]);
  });
  it('extracts bare URLs', () => {
    expect(extractUrlsFromText('see https://a.io/x, and http://b.io/y.')).toEqual(['https://a.io/x', 'http://b.io/y']);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines; joins arrays', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'line1\nline2', d: ['p', 'q'] }], ['a', 'b', 'c', 'd']);
    expect(csv).toBe('a,b,c,d\r\n"x,y","say ""hi""","line1\nline2",p; q');
  });
  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('keywords', () => {
  it('matches phrases case-insensitively', () => {
    expect(matchKeywords('We are Hiring Node.js devs', ['hiring', 'node.js', 'react'])).toEqual(['hiring', 'node.js']);
  });
  it('parses comma or newline separated lists', () => {
    expect(parseKeywordList('a, b\nc,,  a ')).toEqual(['a', 'b', 'c']);
  });
});

describe('collapseDoubled', () => {
  it('collapses LinkedIn duplicated labels', () => {
    expect(collapseDoubled('Jane DoeJane Doe')).toBe('Jane Doe');
    expect(collapseDoubled('Jane Doe')).toBe('Jane Doe');
  });
});

describe('mergePost', () => {
  const base: ExtractedPost = {
    id: 'activity:1',
    url: 'u',
    author: { name: 'A' },
    text: 'short',
    emails: ['a@b.com'],
    links: [],
    capturedAt: '2026-01-01T00:00:00Z',
    searchIds: ['search:a'],
    matchedKeywords: [],
    excludedBy: [],
    status: 'contacted',
    notes: 'emailed them',
  };
  it('keeps longer text, unions emails, preserves status and notes', () => {
    const merged = mergePost(base, { ...base, text: 'short but now expanded', emails: ['c@d.com'], status: 'new', notes: undefined });
    expect(merged.text).toBe('short but now expanded');
    expect(merged.emails).toEqual(['a@b.com', 'c@d.com']);
    expect(merged.status).toBe('contacted');
    expect(merged.notes).toBe('emailed them');
  });
  it('replaces links from a parse with at least as much text, unions them otherwise', () => {
    const stored = { ...base, links: ['https://www.linkedin.com/safety/go/?url=x', 'https://x.io/'] };
    expect(mergePost(stored, { ...base, links: ['https://x.io/'] }).links).toEqual(['https://x.io/']);
    expect(mergePost(stored, { ...base, text: 'sh', links: ['https://y.io/'] }).links).toEqual([...stored.links, 'https://y.io/']);
  });
  it('keeps first capture time and search, records last seen time and every search', () => {
    const later = { ...base, capturedAt: '2026-02-01T00:00:00Z', lastSeenAt: '2026-02-01T00:00:00Z', searchIds: ['search:b'] };
    const merged = mergePost(base, later);
    expect(merged.capturedAt).toBe('2026-01-01T00:00:00Z');
    expect(merged.lastSeenAt).toBe('2026-02-01T00:00:00Z');
    expect(merged.searchIds).toEqual(['search:a', 'search:b']);
    expect(mergePost(merged, { ...later, searchIds: ['search:a'] }).searchIds).toEqual(['search:a', 'search:b']);
  });
  it('returns incoming when nothing stored', () => {
    expect(mergePost(undefined, base)).toBe(base);
  });
});
