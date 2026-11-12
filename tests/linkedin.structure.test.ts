import { beforeEach, describe, expect, it } from 'vitest';
import { diagnosePage } from '../src/content/linkedin/diagnose';
import { expandAll, findLoadMoreButtons, scrollForMore } from '../src/content/linkedin/expand';
import { findPostCards, parsePostCard, urnToDate } from '../src/content/linkedin/parse';
import { activityIdFor } from './fixtures/linkedin-post';

/**
 * Synthetic markup shaped like LinkedIn's class-less layout seen on
 * 2026-11-12: hashed class names, `componentkey` attributes without URNs,
 * no data-urn, "…more" as a span[role=button], social buttons labelled by
 * aria-label. Real samples will replace this once captured.
 */
const now = new Date('2026-11-13T12:00:00Z');
const ctx = { sourceUrl: 'https://www.linkedin.com/search/results/content/?keywords=hiring', now };
const permalinkId = activityIdFor(new Date('2026-11-12T08:00:00Z'));

interface PostOpts {
  href: string;
  name: string;
  headline: string;
  label: string;
  body: string;
  extra?: string;
  comments?: string;
}

const post = (o: PostOpts, i: number) => `
  <div componentkey="auto-component-${i}x9" class="_c9f2${i} _a1b2">
    <div class="_h1">
      <a href="${o.href}?miniProfileUrn=urn%3Ali%3Afsd_profile%3AACoAA${i}" aria-label="View ${o.name}’s profile"><img src="p.jpg" alt=""></a>
      <div class="_h2">
        <a href="${o.href}?miniProfileUrn=urn%3Ali%3Afsd_profile%3AACoAA${i}"><span class="_n">${o.name}</span><span class="_d"> • 3rd+</span></a>
        <p class="_hl">${o.headline}</p>
        <p class="_t"><span>${o.label} • </span><svg><path d="M0"/></svg></p>
      </div>
      <button aria-label="Follow ${o.name}">Follow</button>
      <button aria-label="Open control menu for post by ${o.name}">…</button>
    </div>
    <div class="_b1">
      <p class="_b2"><span class="_b3">${o.body}</span><span role="button" tabindex="0" class="_more">…more</span></p>
    </div>
    ${o.extra ?? ''}
    <div class="_s1">
      <span>12 reactions</span>
      <button aria-label="React Like">Like</button><button>Comment</button><button>Repost</button><button>Send</button>
    </div>
    ${o.comments ?? ''}
  </div>`;

const comment = (who: string, text: string) => `
  <div class="_cm"><a href="/in/${who}/">${who} name</a><span>${text} and a bit more text so it is long enough to look like a post</span>
    <button aria-label="React Like">Like</button><button>Reply</button></div>`;

const PAGE = `
  <header><a href="/in/me/">Me</a><button>More</button></header>
  <main>
    <div class="_x1">
      <div class="_list" componentkey="SearchResultsContainer">
        ${post(
          {
            href: '/in/priya-sharma/',
            name: 'Priya Sharma',
            headline: 'Engineering Manager at Acme',
            label: '2d',
            body: 'We are hiring a MERN developer.<br>Bengaluru, 2+ years. Email priya@acme.io <a href="https://www.linkedin.com/feed/hashtag/?keywords=hiring">#hiring</a>',
            extra: '<div class="_art"><a href="https://lnkd.in/abc"><img src="a.jpg"><span>Job page</span></a></div>',
            comments: `<div class="_cms">${comment('c-one', 'Interested, mail me at commenter@x.io')}${comment('c-two', 'Me too')}</div>`,
          },
          1,
        )}
        ${post(
          {
            href: '/company/acme-labs/',
            name: 'Acme Labs',
            headline: '12,345 followers',
            label: '1w',
            body: 'Acme Labs is hiring Node.js engineers in Pune. Apply at https://acme.io/jobs',
          },
          2,
        )}
        ${post(
          {
            href: '/in/rahul-verma/',
            name: 'Rahul Verma',
            headline: 'Recruiter',
            label: '5h',
            body: 'Hiring React + Node folks, DM me.',
            extra: `<a class="_ts" href="https://www.linkedin.com/posts/rahul-verma_hiring-activity-${permalinkId}-AbCd">permalink</a>`,
          },
          3,
        )}
        <div class="_people"><a href="/in/suggested/">Suggested Person</a><span>Talent partner at a company with a long headline text here</span><button>Follow</button></div>
      </div>
    </div>
  </main>`;

describe('LinkedIn structural fallback (class-less markup)', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
  });

  it('finds the three posts, not comments, not the people suggestion', () => {
    expect(findPostCards(document)).toHaveLength(3);
  });

  it('parses a person post without a URN', () => {
    const [card] = findPostCards(document);
    const p = parsePostCard(card!, ctx)!;
    expect(p.id).toMatch(/^text:[a-z0-9]+$/);
    expect(p.urlKind).toBe('author-activity');
    expect(p.url).toBe('https://www.linkedin.com/in/priya-sharma/recent-activity/all/');
    expect(p.author).toEqual({
      name: 'Priya Sharma',
      headline: 'Engineering Manager at Acme',
      profileUrl: 'https://www.linkedin.com/in/priya-sharma/',
    });
    expect(p.postedAtLabel).toBe('2d');
    expect(p.postedAtApprox).toBe(true);
    expect(p.postedAt).toBe('2026-11-11T12:00:00.000Z');
    expect(p.text).toContain('We are hiring a MERN developer.\nBengaluru, 2+ years.');
    expect(p.text).not.toContain('more');
    expect(p.text).not.toContain('Commenter');
    expect(p.text).not.toContain('reactions');
    expect(p.emails).toEqual(['priya@acme.io']);
    expect(p.links).toContain('https://lnkd.in/abc');
    expect(p.links.some((l) => l.includes('hashtag'))).toBe(false);
  });

  it('parses a company post and links to its posts page', () => {
    const [, card] = findPostCards(document);
    const p = parsePostCard(card!, ctx)!;
    expect(p.author.name).toBe('Acme Labs');
    expect(p.author.headline).toBe('12,345 followers');
    expect(p.url).toBe('https://www.linkedin.com/company/acme-labs/posts/');
    expect(p.links).toContain('https://acme.io/jobs');
  });

  it('uses a post id when one appears anywhere in the card', () => {
    const [, , card] = findPostCards(document);
    const p = parsePostCard(card!, ctx)!;
    expect(p.id).toBe(`activity:${permalinkId}`);
    expect(p.urlKind).toBe('post');
    expect(p.postedAt).toBe('2026-11-12T08:00:00.000Z');
    expect(p.postedAtApprox).toBeUndefined();
  });

  it('keeps the same id after the text grows', () => {
    const [card] = findPostCards(document);
    const before = parsePostCard(card!, ctx)!;
    card!.querySelector('._b3')!.insertAdjacentHTML('beforeend', '<br>Full JD: remote friendly, good pay.');
    const after = parsePostCard(card!, ctx)!;
    expect(after.id).toBe(before.id);
    expect(after.text.length).toBeGreaterThan(before.text.length);
  });

  it('clicks span "…more" toggles inside main once, and never the header "More"', async () => {
    let headerClicks = 0;
    let moreClicks = 0;
    document.querySelector('header button')!.addEventListener('click', () => headerClicks++);
    document.querySelectorAll('._more').forEach((el) => el.addEventListener('click', () => moreClicks++));
    expect(await expandAll(document)).toBe(3);
    expect(await expandAll(document)).toBe(0);
    expect(moreClicks).toBe(3);
    expect(headerClicks).toBe(0);
  });

  it('diagnose reports the structure strategy without leaking names or text', () => {
    const report = diagnosePage();
    expect(report.strategy).toBe('structure');
    expect(report.cardsFound).toBe(3);
    expect(report.cards[0]!.parsed).toMatchObject({ authorName: 'Pxxxx Sxxxxx', urlKind: 'author-activity', postedAtLabel: '2d' });
    expect(report.moreToggles).toEqual([{ tag: 'span', role: 'button', count: 3 }]);
    expect(report.buttonLabels['React Lxxx']).toBe(5); // 3 posts + 2 comments
    const json = JSON.stringify(report);
    for (const secret of ['Priya', 'Sharma', 'priya-sharma', 'MERN developer', 'priya@acme.io', 'rahul-verma']) {
      expect(json).not.toContain(secret);
    }
  });
});

/**
 * Shapes seen in the first live run (2026-11-13): a video post whose
 * video.js control bar carries dir="ltr", a group link holding the post URN
 * URL-encoded, and body links wrapped in /safety/go/ including LinkedIn's
 * auto-linked "B.Tech" and "Node.js".
 */
const groupPostId = activityIdFor(new Date('2026-11-12T07:06:12Z'));

const VIDEO_PLAYER = `
  <div class="_vid">
    <div class="video-js vjs-fluid" role="region" aria-label="Video Player">
      <video class="vjs-tech" src="v.mp4"></video>
      <div class="vjs-control-bar" dir="ltr">
        <button class="vjs-play-control" type="button"><span class="vjs-control-text">Play</span></button>
        <div class="vjs-current-time vjs-time-control vjs-control"><span class="vjs-control-text" role="presentation">Current Time&nbsp;</span><span class="vjs-current-time-display" role="presentation">0:00</span></div>
        <div class="vjs-time-control vjs-time-divider" aria-hidden="true"><div><span>/</span></div></div>
        <div class="vjs-duration vjs-time-control vjs-control"><span class="vjs-control-text" role="presentation">Duration&nbsp;</span><span class="vjs-duration-display" role="presentation">0:42</span></div>
        <div class="vjs-progress-control vjs-control"><div class="vjs-load-progress"><span class="vjs-control-text"><span>Loaded</span>: <span>9.38%</span></span></div></div>
        <div class="vjs-live-control vjs-control"><div class="vjs-live-display"><span class="vjs-control-text">Stream Type&nbsp;</span>LIVE</div></div>
        <div class="vjs-remaining-time vjs-time-control vjs-control"><span class="vjs-control-text" role="presentation">Remaining Time&nbsp;</span><span>-</span><span role="presentation">0:42</span></div>
        <div class="vjs-playback-rate vjs-menu-button vjs-control"><div class="vjs-playback-rate-value">1x</div><button type="button"><span class="vjs-control-text">Playback Rate</span></button></div>
        <div class="vjs-subs-caps-button vjs-menu-button vjs-control"><button type="button"><span class="vjs-control-text">Captions</span></button>
          <div class="vjs-menu"><ul class="vjs-menu-content" role="menu">
            <li class="vjs-menu-item" role="menuitemradio">captions settings, opens captions settings dialog</li>
            <li class="vjs-menu-item vjs-selected" role="menuitemradio">captions off, selected</li>
          </ul></div>
        </div>
      </div>
    </div>
  </div>`;

const LIVE_PAGE = `
  <main>
    <div class="_list">
      ${post(
        {
          href: '/in/nimra-c/',
          name: 'Nimra C',
          headline: 'Talent partner',
          label: '11h',
          body: 'MERN role, see video. <a href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Flnkd.in%2FdPV-tAxi&amp;urlhash=LUDx&amp;mt=abc&amp;isSdui=true">https://lnkd.in/dPV-tAxi</a>',
          extra: `<a href="https://www.linkedin.com/groups/10011043/?q=highlightedFeedForGroups&amp;highlightedUpdateUrn=urn%3Ali%3Aactivity%3A${groupPostId}">MERN Jobs</a>${VIDEO_PLAYER}`,
        },
        1,
      )}
      ${post(
        {
          href: '/in/roshan-k/',
          name: 'Roshan K',
          headline: 'HR',
          label: '2h',
          body: 'Hiring MERN devs. <a href="https://www.linkedin.com/safety/go/?url=http%3A%2F%2FB.Tech&amp;urlhash=4dZl">B.Tech</a> / <a href="https://www.linkedin.com/safety/go/?url=http%3A%2F%2FB.Tech%2FB.E&amp;urlhash=vHwE">B.Tech/B.E</a> with <a href="https://www.linkedin.com/safety/go/?url=http%3A%2F%2FNode.js&amp;urlhash=x1">Node.js</a>. Apply <a href="https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Facme.io%2Fjobs">here</a>',
        },
        2,
      )}
    </div>
  </main>`;

describe('LinkedIn structural fallback, live-run regressions', () => {
  beforeEach(() => {
    document.body.innerHTML = LIVE_PAGE;
  });

  it('never takes video player controls as the post body', () => {
    const [card] = findPostCards(document);
    const p = parsePostCard(card!, ctx)!;
    expect(p.text).toContain('MERN role, see video.');
    for (const noise of ['Current Time', 'Duration', 'Stream Type', 'captions']) expect(p.text).not.toContain(noise);
  });

  it('reads a URL-encoded post URN and dates it from the id', () => {
    const [card] = findPostCards(document);
    const p = parsePostCard(card!, ctx)!;
    expect(p.id).toBe(`activity:${groupPostId}`);
    expect(p.urlKind).toBe('post');
    expect(p.postedAt).toBe('2026-11-12T07:06:12.000Z');
  });

  it('unwraps /safety/go/ links and drops group links and auto-linked words', () => {
    const [first, second] = findPostCards(document).map((c) => parsePostCard(c, ctx)!);
    expect(first!.links).toEqual(['https://lnkd.in/dPV-tAxi']);
    expect(second!.links).toEqual(['https://acme.io/jobs']);
  });
});

describe('LinkedIn post id timestamps', () => {
  it('decodes a real activity id (top 41 of 63 bits)', () => {
    expect(urnToDate({ kind: 'activity', id: '7526540841386160128' })?.toISOString()).toBe('2026-11-12T07:06:12.953Z');
  });
});

describe('LinkedIn scrolling', () => {
  it('finds "Show more results" by text, not post "see more" toggles', () => {
    document.body.innerHTML = `<main>${post({ href: '/in/a/', name: 'A', headline: 'H', label: '1d', body: 'Hiring MERN developers in Pune, apply now please.' }, 1)}
      <button><span>Show more results</span></button><button aria-label="Load more posts"></button></main>`;
    expect(findLoadMoreButtons().map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Show more results', 'Load more posts']);
  });

  it('clicks load-more and counts growth inside <main> even when the page height does not change', async () => {
    document.body.innerHTML = `<main><div class="_list"></div><button>Show more results</button></main>`;
    window.scrollTo = () => {};
    const list = document.querySelector('._list')!;
    document.querySelector('button')!.addEventListener('click', () => list.insertAdjacentHTML('beforeend', '<a href="/in/new/">New</a>'));
    expect(await scrollForMore(500, list)).toBe(true);
    expect(await scrollForMore(200, list)).toBe(true); // clicked again, another link
    document.querySelector('button')!.remove();
    expect(await scrollForMore(200, list)).toBe(false);
  });
});
