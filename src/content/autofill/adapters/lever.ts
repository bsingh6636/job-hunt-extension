import { profileDerived as d } from '@profile/profile.schema';
import type { Adapter } from './Adapter';
import { byName, byQuestion, firstOf, yesNo } from './Adapter';

/**
 * Lever (jobs.lever.co/<company>/<id>/apply). Single page, classic inputs
 * with stable names. Custom questions live in `.application-question`
 * blocks; byQuestion finds the block and the radio/select setter handles
 * the control inside.
 */
export const lever: Adapter = {
  name: 'lever',
  detect: (url) => /(^|\.)lever\.co$/i.test(url.hostname),
  fields: [
    { key: 'identity.fullName', label: 'Full name', locate: byName('name'), value: (p) => d.fullName(p) },
    { key: 'contact.email', label: 'Email', locate: byName('email'), value: (p) => p.contact.email },
    { key: 'contact.phone', label: 'Phone', locate: byName('phone'), value: (p) => d.phoneE164(p) },
    { key: 'experience.0.company', label: 'Current company', locate: byName('org'), value: (p) => d.currentCompany(p) },
    { key: 'location.city', label: 'Location', locate: byName('location'), value: (p) => d.cityCountry(p) },
    { key: 'links.linkedin', label: 'LinkedIn URL', locate: byName('urls[LinkedIn]'), value: (p) => p.links.linkedin },
    { key: 'links.github', label: 'GitHub URL', locate: byName('urls[GitHub]'), value: (p) => p.links.github },
    { key: 'links.portfolio', label: 'Portfolio URL', locate: firstOf(byName('urls[Portfolio]'), byName('urls[Other]')), value: (p) => p.links.portfolio },
    {
      key: 'workAuthorization.authorized',
      label: 'Authorized to work',
      locate: byQuestion(/authori[sz]ed to work|work authori[sz]ation/i),
      value: (p) => yesNo(p.workAuthorization.authorized),
      match: 'startsWith',
    },
    {
      key: 'workAuthorization.requiresSponsorship',
      label: 'Requires sponsorship',
      locate: byQuestion(/sponsorship/i),
      value: (p) => yesNo(p.workAuthorization.requiresSponsorship),
      match: 'startsWith',
    },
    { key: 'workAuthorization.noticePeriod', label: 'Notice period', locate: byQuestion(/notice period/i), value: (p) => p.workAuthorization.noticePeriod },
    { key: 'compensation.expected', label: 'Expected compensation', locate: byQuestion(/expected (salary|ctc|compensation)/i), value: (p) => p.compensation?.expected },
    { key: 'compensation.current', label: 'Current compensation', locate: byQuestion(/current (salary|ctc|compensation)/i), value: (p) => p.compensation?.current },
  ],
  formControlSelector: 'input, select, textarea',
};
