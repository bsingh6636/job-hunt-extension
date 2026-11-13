import { describe, expect, it } from 'vitest';
import {
  hasLegacyUrls,
  liftLegacyUrls,
  normalizeSearchUrl,
  searchBook,
  searchIdOf,
  searchIdsOf,
  searchKeywords,
  searchLabel,
  searchPageFor,
  searchUrlsOf,
} from '../src/shared/searches';
import type { ExtractedPost, SearchPage } from '../src/shared/types';

describe('searches', () => {
  it('normalizes search URLs by stripping volatile params and sorting remainder', () => {
    const raw = 'https://www.linkedin.com/search/results/content/?sid=abc&keywords=hiring&origin=GLOBAL_SEARCH_HEADER#top';
    expect(normalizeSearchUrl(raw)).toBe('https://www.linkedin.com/search/results/content/?keywords=hiring');
  });

  it('produces stable search IDs for URLs with different volatile params', () => {
    const url1 = 'https://www.linkedin.com/search/results/content/?keywords=react&sid=123';
    const url2 = 'https://www.linkedin.com/search/results/content/?origin=HEADER&keywords=react';
    expect(searchIdOf(url1)).toBe(searchIdOf(url2));
    expect(searchIdOf(url1)).toMatch(/^search:[0-9a-z]+$/);
  });

  it('extracts decoded search keywords', () => {
    expect(searchKeywords('https://www.linkedin.com/search/results/content/?keywords=%22hiring%22+MERN')).toBe('"hiring" MERN');
    expect(searchKeywords('https://www.linkedin.com/feed/')).toBeUndefined();
  });

  it('generates human-readable labels from search pages', () => {
    const pageWithKeywords: SearchPage = {
      id: 's1',
      url: 'https://www.linkedin.com/search/results/content/?keywords=react',
      keywords: 'react',
      firstSeenAt: '2026-11-13T00:00:00Z',
      lastSeenAt: '2026-11-13T00:00:00Z',
    };
    expect(searchLabel(pageWithKeywords)).toBe('react');

    const feedPage: SearchPage = {
      id: 's2',
      url: 'https://www.linkedin.com/feed/',
      firstSeenAt: '2026-11-13T00:00:00Z',
      lastSeenAt: '2026-11-13T00:00:00Z',
    };
    expect(searchLabel(feedPage)).toBe('/feed/');
  });

  it('creates SearchPage structure with searchPageFor', () => {
    const page = searchPageFor('https://www.linkedin.com/search/results/content/?keywords=dev&sid=x', '2026-11-13T10:00:00Z');
    expect(page.keywords).toBe('dev');
    expect(page.url).toBe('https://www.linkedin.com/search/results/content/?keywords=dev');
    expect(page.firstSeenAt).toBe('2026-11-13T10:00:00Z');
    expect(page.lastSeenAt).toBe('2026-11-13T10:00:00Z');
  });

  it('detects legacy URLs on ExtractedPost', () => {
    const legacyPost = { id: 'p1', sourceUrl: 'https://link' } as ExtractedPost;
    const modernPost = { id: 'p2', searchIds: ['search:1'] } as ExtractedPost;
    expect(hasLegacyUrls(legacyPost)).toBe(true);
    expect(hasLegacyUrls(modernPost)).toBe(false);
  });

  it('resolves searchIds and URLs for modern and legacy posts', () => {
    const post: ExtractedPost = {
      id: 'p1',
      url: 'u',
      author: { name: 'A' },
      text: 't',
      emails: [],
      links: [],
      capturedAt: '2026-11-13T00:00:00Z',
      searchIds: ['s1', 's2'],
      matchedKeywords: [],
      excludedBy: [],
      status: 'new',
    };
    const searches = new Map<string, SearchPage>([
      ['s1', { id: 's1', url: 'https://search1', firstSeenAt: '', lastSeenAt: '' }],
      ['s2', { id: 's2', url: 'https://search2', firstSeenAt: '', lastSeenAt: '' }],
    ]);
    expect(searchIdsOf(post)).toEqual(['s1', 's2']);
    expect(searchUrlsOf(post, searches)).toEqual(['https://search1', 'https://search2']);
  });

  it('tracks seen searches and records earliest and latest timestamps in searchBook', () => {
    const book = searchBook([]);
    const id1 = book.see('https://www.linkedin.com/feed/?sid=1', '2026-11-13T02:00:00Z');
    const id2 = book.see('https://www.linkedin.com/feed/?sid=2', '2026-11-13T05:00:00Z');
    book.see('https://www.linkedin.com/feed/', '2026-11-13T01:00:00Z');

    expect(id1).toBe(id2);
    const changed = book.changed();
    expect(changed).toHaveLength(1);
    expect(changed[0]!.firstSeenAt).toBe('2026-11-13T01:00:00Z');
    expect(changed[0]!.lastSeenAt).toBe('2026-11-13T05:00:00Z');
  });

  it('lifts legacy sourceUrl/sourceUrls from a post into searches in searchBook', () => {
    const book = searchBook([]);
    const legacyPost: ExtractedPost = {
      id: 'p1',
      url: 'u',
      author: { name: 'A' },
      text: 't',
      emails: [],
      links: [],
      capturedAt: '2026-11-13T01:00:00Z',
      lastSeenAt: '2026-11-13T04:00:00Z',
      sourceUrl: 'https://www.linkedin.com/search/results/content/?keywords=react',
      sourceUrls: [
        'https://www.linkedin.com/search/results/content/?keywords=react',
        'https://www.linkedin.com/feed/',
      ],
      matchedKeywords: [],
      excludedBy: [],
      status: 'new',
    };

    const lifted = liftLegacyUrls(legacyPost, book);
    expect(lifted.sourceUrl).toBeUndefined();
    expect(lifted.sourceUrls).toBeUndefined();
    expect(lifted.searchIds).toHaveLength(2);
    expect(book.changed()).toHaveLength(2);
  });
});
