import { profileDerived as d } from '@profile/profile.schema';
import type { Adapter } from './Adapter';
import { byAria, byId, byLabel, firstOf, yesNo } from './Adapter';

/**
 * Greenhouse job boards: boards.greenhouse.io (classic) and
 * job-boards.greenhouse.io (new React UI). Classic uses stable ids; the new
 * UI uses labels + react-select comboboxes, so every spec has both.
 */
export const greenhouse: Adapter = {
  name: 'greenhouse',
  detect: (url) => /(^|\.)greenhouse\.io$/i.test(url.hostname),
  fields: [
    { key: 'identity.firstName', label: 'First name', locate: firstOf(byId('first_name'), byLabel(/^first name/i)), value: (p) => p.identity.firstName },
    { key: 'identity.lastName', label: 'Last name', locate: firstOf(byId('last_name'), byLabel(/^last name/i)), value: (p) => p.identity.lastName },
    { key: 'contact.email', label: 'Email', locate: firstOf(byId('email'), byLabel(/^e-?mail/i)), value: (p) => p.contact.email },
    { key: 'contact.phone', label: 'Phone', locate: firstOf(byId('phone'), byLabel(/^phone/i)), value: (p) => d.phoneE164(p) },
    {
      key: 'location.city',
      label: 'Location',
      locate: firstOf(byId('job_application_location'), byId('candidate-location'), byLabel(/^location|city/i), byAria(/location/i)),
      value: (p) => d.cityCountry(p),
    },
    { key: 'links.linkedin', label: 'LinkedIn', locate: firstOf(byLabel(/linkedin/i), byAria(/linkedin/i)), value: (p) => p.links.linkedin },
    { key: 'links.github', label: 'GitHub', locate: firstOf(byLabel(/github/i), byAria(/github/i)), value: (p) => p.links.github },
    { key: 'links.portfolio', label: 'Portfolio / website', locate: firstOf(byLabel(/portfolio|website/i), byAria(/portfolio|website/i)), value: (p) => p.links.portfolio },
    {
      key: 'experience.0.company',
      label: 'Current company',
      locate: firstOf(byLabel(/current (company|employer)/i), byAria(/current company/i)),
      value: (p) => d.currentCompany(p),
    },
    {
      key: 'workAuthorization.authorized',
      label: 'Authorized to work',
      locate: byLabel(/(legally )?authori[sz]ed to work|work authori[sz]ation/i),
      value: (p) => yesNo(p.workAuthorization.authorized),
      match: 'startsWith',
    },
    {
      key: 'workAuthorization.requiresSponsorship',
      label: 'Requires sponsorship',
      locate: byLabel(/sponsorship/i),
      value: (p) => yesNo(p.workAuthorization.requiresSponsorship),
      match: 'startsWith',
    },
    // Education on the new UI is a react-select combobox that searches as you type.
    { key: 'education.0.university', label: 'School', locate: firstOf(byId('school--0'), byLabel(/^school/i)), value: (p) => p.education[0]?.university, typeToSearch: true },
    { key: 'education.0.degree', label: 'Degree', locate: firstOf(byId('degree--0'), byLabel(/^degree/i)), value: (p) => p.education[0]?.degree, typeToSearch: true, match: 'includes' },
    { key: 'education.0.field', label: 'Discipline', locate: firstOf(byId('discipline--0'), byLabel(/^discipline|field of study/i)), value: (p) => p.education[0]?.field, typeToSearch: true, match: 'includes' },
    { key: 'answers.howDidYouHear', label: 'How did you hear', locate: byLabel(/how did you hear/i), value: (p) => p.answers.howDidYouHear, match: 'includes' },
  ],
};
