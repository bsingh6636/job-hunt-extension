import { beforeEach, describe, expect, it } from 'vitest';
import { parseProfile } from '../profile/profile.schema';
import example from '../profile/profile.example.json';
import type { Adapter } from '../src/content/autofill/adapters/Adapter';
import { byId, byLabel, byName, byQuestion, yesNo } from '../src/content/autofill/adapters/Adapter';
import { greenhouse } from '../src/content/autofill/adapters/greenhouse';
import { lever } from '../src/content/autofill/adapters/lever';
import { workday } from '../src/content/autofill/adapters/workday';
import { runFill } from '../src/content/autofill/engine';

const parsed = parseProfile(example);
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const profile = parsed.profile;

const FORM = `
<form>
  <label for="first_name">First Name</label><input id="first_name" name="first_name" type="text">
  <label for="last_name">Last Name</label><input id="last_name" name="last_name" type="text" value="Already">
  <label for="email">Email</label><input id="email" type="email">
  <label for="country">Country</label>
  <select id="country"><option value="">Select</option><option value="IN">India</option><option value="US">United States</option></select>
  <fieldset class="application-question">
    <legend>Are you legally authorized to work in India?</legend>
    <label><input type="radio" name="auth" value="yes"> Yes</label>
    <label><input type="radio" name="auth" value="no"> No</label>
  </fieldset>
  <label><input type="checkbox" id="relocate"> Willing to relocate</label>
  <label for="mystery">Favourite colour</label><input id="mystery" type="text">
</form>`;

const testAdapter: Adapter = {
  name: 'test',
  detect: () => true,
  fields: [
    { key: 'identity.firstName', label: 'First name', locate: byId('first_name'), value: (p) => p.identity.firstName },
    { key: 'identity.lastName', label: 'Last name', locate: byId('last_name'), value: (p) => p.identity.lastName },
    { key: 'contact.email', label: 'Email', locate: byLabel(/^email/i), value: (p) => p.contact.email },
    { key: 'location.country', label: 'Country', locate: byId('country'), value: (p) => p.location.country },
    { key: 'workAuthorization.authorized', label: 'Authorized', locate: byQuestion(/authorized to work/i), value: (p) => yesNo(p.workAuthorization.authorized) },
    { key: 'workAuthorization.willingToRelocate', label: 'Relocate', locate: byId('relocate'), value: (p) => p.workAuthorization.willingToRelocate },
    { key: 'links.github', label: 'GitHub', locate: byName('github'), value: (p) => p.links.github },
    { key: 'identity.preferredName', label: 'Preferred name', locate: byId('first_name'), value: (p) => p.identity.preferredName },
  ],
};

describe('autofill engine', () => {
  beforeEach(() => {
    document.body.innerHTML = FORM;
  });

  it('fills text, select, radio and checkbox; reports skipped and unmatched', async () => {
    const events: string[] = [];
    document.getElementById('first_name')!.addEventListener('input', () => events.push('input'));

    const report = await runFill(testAdapter, profile, { fillEmptyOnly: true, highlight: false }, document);

    expect((document.getElementById('first_name') as HTMLInputElement).value).toBe('Asha');
    expect(events).toContain('input');
    expect((document.getElementById('last_name') as HTMLInputElement).value).toBe('Already');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('asha.example@example.com');
    expect((document.getElementById('country') as HTMLSelectElement).value).toBe('IN');
    expect((document.querySelector('input[name="auth"][value="yes"]') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('relocate') as HTMLInputElement).checked).toBe(true);

    expect(report.filled.map((f) => f.key)).toEqual([
      'identity.firstName',
      'contact.email',
      'location.country',
      'workAuthorization.authorized',
      'workAuthorization.willingToRelocate',
    ]);
    expect(report.skipped.find((s) => s.key === 'identity.lastName')?.reason).toBe('already filled');
    expect(report.skipped.find((s) => s.key === 'identity.preferredName')?.reason).toBe('no value in profile');
    expect(report.unmatched.map((u) => u.key)).toEqual(['links.github']);
    expect(report.unknownFields.map((u) => u.label)).toEqual(['Favourite colour']);
  });

  it('overwrites when fillEmptyOnly is false', async () => {
    await runFill(testAdapter, profile, { fillEmptyOnly: false, highlight: false }, document);
    expect((document.getElementById('last_name') as HTMLInputElement).value).toBe('Example');
  });
});

describe('adapter detection', () => {
  const doc = document;
  it('matches hosts', () => {
    expect(greenhouse.detect(new URL('https://boards.greenhouse.io/acme/jobs/123'), doc)).toBe(true);
    expect(greenhouse.detect(new URL('https://job-boards.greenhouse.io/acme/jobs/123'), doc)).toBe(true);
    expect(lever.detect(new URL('https://jobs.lever.co/acme/uuid/apply'), doc)).toBe(true);
    expect(workday.detect(new URL('https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x/apply'), doc)).toBe(true);
    expect(workday.detect(new URL('https://www.linkedin.com/jobs'), doc)).toBe(false);
  });
  it('every spec has a unique key', () => {
    for (const adapter of [greenhouse, lever, workday]) {
      const keys = adapter.fields.map((f) => f.key);
      expect(new Set(keys).size, adapter.name).toBe(keys.length);
    }
  });
});
