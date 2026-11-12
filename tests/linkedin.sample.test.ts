import { describe, expect, it } from 'vitest';
import { capturePageSample } from '../src/content/linkedin/sample';

describe('LinkedIn page sample', () => {
  it('captures the full page with scripts disabled and finds post ids anywhere', () => {
    document.head.innerHTML = '<meta name="csrf-token" content="secret"><script src="https://static.licdn.com/app.js"></script>';
    document.body.innerHTML = `
      <header><a href="/in/me/">Me</a></header>
      <main>
        <div componentkey="expanded7391234567890123456FeedType_MAIN">
          <a href="/in/jane-doe/">Jane Doe</a>
          <a href="https://www.linkedin.com/feed/update/urn:li:activity:7391234567890123456/">2d</a>
          <span data-testid="expandable-text-box">Hiring a MERN developer</span>
          <button aria-expanded="false">…more</button>
        </div>
        <script>window.x = "urn:li:activity:7391234567890123456"</script>
        <script type="application/json">{"a":1}</script>
      </main>`;
    const sample = capturePageSample(document, 'link 1: https://www.linkedin.com/posts/x');

    expect(sample.note).toContain('link 1');
    expect(sample.idScan.attributes.map((a) => a.attr)).toEqual(expect.arrayContaining(['componentkey', 'href']));
    expect(sample.idScan.postLinks).toHaveLength(1);
    expect(sample.idScan.scriptMatches).toBe(1);
    expect(sample.testIds['expandable-text-box']).toBe(1);
    expect(sample.buttons[0]).toEqual({ text: '…more', ariaLabel: null, ariaExpanded: 'false' });

    // Full document, not just <main>.
    expect(sample.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(sample.html).toContain('<header>');
    expect(sample.html).toContain('Hiring a MERN developer');
    expect(sample.html).toContain('<base href="https://www.linkedin.com/">');
    // Scripts kept as inert text, external script src removed, data scripts untouched.
    expect(sample.html).toContain('type="text/x-jobhunt-disabled"');
    expect(sample.html).toContain('window.x = ');
    expect(sample.html).not.toMatch(/<script[^>]* src=/);
    expect(sample.html).toContain('<script type="application/json">');
    expect(sample.html).not.toContain('secret');
    // The live page itself is untouched.
    expect(document.querySelector('script[src]')).not.toBeNull();
  });
});
