import { beforeEach, describe, expect, it } from 'vitest';
import { findPostCards, parsePostCard, readUrn, urnToDate } from '../src/content/linkedin/parse';
import { PAGE, activityIdFor } from './fixtures/linkedin-post';

const ctx = { sourceUrl: 'https://www.linkedin.com/search/results/content/?keywords=hiring', now: new Date('2026-11-12T00:00:00Z') };

describe('LinkedIn parse', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
  });

  it('finds top-level cards only (nested reshare excluded)', () => {
    const cards = findPostCards(document);
    expect(cards).toHaveLength(2);
  });

  it('parses author, text, emails, links and timestamp', () => {
    const [card] = findPostCards(document);
    const post = parsePostCard(card!, ctx)!;

    expect(post.id).toMatch(/^activity:\d+$/);
    expect(post.url).toBe(`https://www.linkedin.com/feed/update/urn:li:activity:${activityIdFor(new Date('2026-11-10T09:30:00Z'))}/`);
    expect(post.author.name).toBe('Priya Sharma');
    expect(post.author.headline).toBe('Engineering Manager at Acme Labs');
    expect(post.author.profileUrl).toBe('https://www.linkedin.com/in/priya-sharma-123/');
    expect(post.postedAtLabel).toBe('2d');
    expect(post.postedAt).toBe('2026-11-10T09:30:00.000Z');

    expect(post.text).toContain('We are hiring a Node.js backend engineer');
    expect(post.text).toContain('\nImmediate joiners preferred.');
    expect(post.text).not.toContain('…more');

    expect(post.emails.sort()).toEqual(['careers@acmelabs.io', 'priya@acmelabs.io']);
    expect(post.links).toContain('https://acmelabs.io/jobs/42');
    expect(post.links).toContain('https://lnkd.in/gXYZ123');
    expect(post.links.some((l) => l.includes('hashtag'))).toBe(false);
    expect(post.status).toBe('new');
    expect(post.sourceUrl).toBe(ctx.sourceUrl);
  });

  it('keeps reshare commentary and drops the nested original as a separate post', () => {
    const [, card] = findPostCards(document);
    const post = parsePostCard(card!, ctx)!;
    expect(post.author.name).toBe('Rahul Verma');
    expect(post.text).toContain('Sharing this opportunity');
  });

  it('decodes dates from activity ids', () => {
    const date = new Date('2025-03-01T10:00:00Z');
    expect(urnToDate({ kind: 'activity', id: activityIdFor(date) })?.toISOString()).toBe(date.toISOString());
    expect(urnToDate({ kind: 'activity', id: '1' })).toBeUndefined();
  });

  it('falls back to generic markup when known classes are absent', () => {
    const id = activityIdFor(new Date('2026-11-11T08:00:00Z'));
    document.body.innerHTML = `
      <main>
        <div componentkey="urn:li:activity:${id}">
          <div class="header"><a href="/in/jane-doe/?miniProfile=1">Jane Doe<span>Jane Doe</span></a></div>
          <div dir="ltr">We are hiring a React developer. Email jane@acme.io<br>Bengaluru, immediate joiners.</div>
          <div class="social-counts">12 reactions</div>
        </div>
      </main>`;
    const cards = findPostCards(document);
    expect(cards).toHaveLength(1);
    const post = parsePostCard(cards[0]!, ctx)!;
    expect(post.id).toBe(`activity:${id}`);
    expect(post.author.name).toBe('Jane Doe');
    expect(post.author.profileUrl).toBe('https://www.linkedin.com/in/jane-doe/');
    expect(post.text).toContain('We are hiring a React developer');
    expect(post.text).not.toContain('12 reactions');
    expect(post.emails).toEqual(['jane@acme.io']);
  });

  it('reads URNs from data-urn and data-id, including aggregate wrappers', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', 'urn:li:aggregate:(urn:li:activity:7000000000000000001,urn:li:activity:7000000000000000002)');
    expect(readUrn(el)).toEqual({ kind: 'activity', id: '7000000000000000001' });
    const none = document.createElement('div');
    expect(readUrn(none)).toBeNull();
  });
});
