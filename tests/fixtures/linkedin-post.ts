/**
 * Synthetic LinkedIn post markup built from the selectors in
 * src/content/linkedin/selectors.ts. It mirrors the real structure (actor
 * block, commentary, "...more" toggle, nested reshare) but is NOT a copy of
 * LinkedIn HTML. When LinkedIn changes its DOM, update selectors.ts and
 * this fixture together.
 */
export function activityIdFor(date: Date): string {
  return (BigInt(date.getTime()) << 22n).toString();
}

export interface FixturePost {
  activityId: string;
  name: string;
  headline?: string;
  profilePath?: string;
  label?: string;
  html: string;
  nested?: string;
}

export function postCard(p: FixturePost): string {
  return `
<div class="feed-shared-update-v2" data-urn="urn:li:activity:${p.activityId}">
  <div class="update-components-actor">
    <a class="update-components-actor__meta-link" href="${p.profilePath ?? '/in/someone/'}?trk=feed">
      <span class="update-components-actor__title">
        <span aria-hidden="true">${p.name}</span>
        <span class="visually-hidden">${p.name}</span>
      </span>
      <span class="update-components-actor__description">
        <span aria-hidden="true">${p.headline ?? ''}</span>
      </span>
      <span class="update-components-actor__sub-description">
        <span aria-hidden="true">${p.label ?? '3d'} • <span class="visually-hidden">Edited</span></span>
      </span>
    </a>
  </div>
  <div class="feed-shared-update-v2__description">
    <div class="update-components-text">
      <span class="break-words">${p.html}</span>
      <button class="feed-shared-inline-show-more-text__see-more-less-toggle">…more</button>
    </div>
  </div>
  ${p.nested ?? ''}
</div>`;
}

export const HIRING_POST = postCard({
  activityId: activityIdFor(new Date('2026-11-10T09:30:00Z')),
  name: 'Priya Sharma',
  headline: 'Engineering Manager at Acme Labs',
  profilePath: '/in/priya-sharma-123/',
  label: '2d',
  html: `We are <strong>hiring</strong> a Node.js backend engineer (2+ years) in Bengaluru.<br>
Immediate joiners preferred.<br><br>
Send your resume to <a href="mailto:careers@acmelabs.io">careers@acmelabs.io</a> or priya [at] acmelabs [dot] io<br>
JD: <a href="https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Facmelabs.io%2Fjobs%2F42&amp;urlhash=abc">https://acmelabs.io/jobs/42</a>
<a href="https://lnkd.in/gXYZ123">https://lnkd.in/gXYZ123</a>
<a href="https://www.linkedin.com/feed/hashtag/?keywords=hiring">#hiring</a>`,
});

export const RESHARE_POST = postCard({
  activityId: activityIdFor(new Date('2026-11-09T12:00:00Z')),
  name: 'Rahul Verma',
  headline: 'Recruiter',
  profilePath: '/in/rahul-verma/',
  label: '1d',
  html: 'Sharing this opportunity for my network.',
  nested: `
  <div class="update-components-mini-update-v2">
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:${activityIdFor(new Date('2026-11-08T12:00:00Z'))}">
      <div class="update-components-text"><span class="break-words">Original post text, open to work.</span></div>
    </div>
  </div>`,
});

export const PAGE = `<main>${HIRING_POST}${RESHARE_POST}</main>`;
