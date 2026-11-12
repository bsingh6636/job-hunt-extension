import { beforeEach, describe, expect, it } from 'vitest';
import { pickPause, runExtraction, type PageSession } from '../src/content/linkedin/extract';
import { DEFAULT_SETTINGS, type ExtractedPost, type ExtractOptions } from '../src/shared/types';

/** Class-less cards, as on content search since 2026-11-12. */
const card = (i: number) => `
  <div class="_c${i}">
    <a href="/in/person-${i}/"><span>Person ${i}</span></a>
    <p>Recruiter ${i}</p>
    <p><span>${i}h • </span></p>
    <div><p><span class="_body">Post number ${i}: hiring MERN developers, apply at the link below, thanks.</span></p></div>
    <div><button aria-label="React Like">Like</button><button>Comment</button><button>Repost</button><button>Send</button></div>
  </div>`;

const page = (n: number) => `<main><div class="_list">${Array.from({ length: n }, (_, i) => card(i + 1)).join('')}</div></main>`;

const options: ExtractOptions = { ...DEFAULT_SETTINGS.extract, maxPosts: 2, moreBatch: 2, expand: false, scrollDelayMs: 20, pauseMinMs: 0, pauseMaxMs: 0 };

function harness() {
  const session: PageSession = { url: '', sent: new Map() };
  const batches: ExtractedPost[][] = [];
  const messages: string[] = [];
  const deps = {
    session,
    shouldStop: () => false,
    send: async (posts: ExtractedPost[]) => {
      batches.push(posts);
      return posts.length;
    },
    report: async (p: { message: string }) => {
      messages.push(p.message);
    },
  };
  return { deps, batches, messages, authors: () => batches.flat().map((p) => p.author.name) };
}

describe('LinkedIn extraction loop', () => {
  beforeEach(() => {
    document.body.innerHTML = page(5);
    window.scrollTo = () => {};
  });

  it('Extract captures the requested number of posts from the top', async () => {
    const h = harness();
    await runExtraction(options, 'fresh', h.deps);
    expect(h.authors()).toEqual(['Person 1', 'Person 2']);
    expect(h.messages.at(-1)).toBe('Captured 2 of 2. Press More for the next 2.');
  });

  it('More continues with posts not captured yet, and stops when nothing new loads', async () => {
    const h = harness();
    await runExtraction(options, 'fresh', h.deps);
    await runExtraction(options, 'more', h.deps);
    expect(h.authors()).toEqual(['Person 1', 'Person 2', 'Person 3', 'Person 4']);
    await runExtraction(options, 'more', h.deps);
    expect(h.authors()).toEqual(['Person 1', 'Person 2', 'Person 3', 'Person 4', 'Person 5']);
    expect(h.messages.at(-1)).toBe('Captured 1 of 2. No more posts loaded');
  });

  it('Extract starts over from the top; a grown post is re-sent without counting', async () => {
    const h = harness();
    await runExtraction(options, 'fresh', h.deps);
    await runExtraction(options, 'fresh', h.deps);
    expect(h.authors()).toEqual(['Person 1', 'Person 2', 'Person 1', 'Person 2']);

    document.querySelector('._c1 ._body')!.insertAdjacentHTML('beforeend', ' Full JD: remote, good pay, apply soon.');
    await runExtraction(options, 'more', h.deps);
    expect(h.authors().slice(4)).toEqual(['Person 1', 'Person 3', 'Person 4']);
  });

  it('picks a random pause between min and max, in either order', () => {
    expect(pickPause(3000, 7000, () => 0)).toBe(3000);
    expect(pickPause(3000, 7000, () => 1)).toBe(7000);
    expect(pickPause(7000, 3000, () => 0.5)).toBe(5000);
  });
});
