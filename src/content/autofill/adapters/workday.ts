import type { Adapter, FieldSpec } from './Adapter';
import { byAutomationId, byLabel, firstOf, month, year, yesNo } from './Adapter';

/**
 * Workday (<tenant>.myworkdayjobs.com). Multi-step flow: "My Information",
 * "My Experience", "Application Questions", "Voluntary Disclosures",
 * "Review". Controls carry data-automation-id, which is stable across
 * tenants; labels and the set of questions vary. Run the fill once per step.
 *
 * Known limits (Phase 1):
 *  - Fills only the FIRST education and experience entry. Workday repeats
 *    the same automation ids for each entry, so a later version will scope
 *    locators to the Nth [data-automation-id="...-N"] panel.
 *  - Country / phone-code prompts are comboboxes that scroll a long list;
 *    the setter matches by text prefix, which works for "India".
 *
 * Tenant overrides: add an entry to TENANT_OVERRIDES keyed by hostname when a
 * company renames something.
 */
const common: FieldSpec[] = [
  // --- My Information ---
  { key: 'identity.firstName', label: 'Legal first name', locate: byAutomationId('legalNameSection_firstName'), value: (p) => p.identity.firstName },
  { key: 'identity.lastName', label: 'Legal last name', locate: byAutomationId('legalNameSection_lastName'), value: (p) => p.identity.lastName },
  { key: 'identity.preferredName', label: 'Preferred name', locate: byAutomationId('preferredNameSection_firstName'), value: (p) => p.identity.preferredName },
  { key: 'location.addressLine1', label: 'Address line 1', locate: byAutomationId('addressSection_addressLine1'), value: (p) => p.location.addressLine1 },
  { key: 'location.city', label: 'City', locate: byAutomationId('addressSection_city'), value: (p) => p.location.city },
  { key: 'location.postalCode', label: 'Postal code', locate: byAutomationId('addressSection_postalCode'), value: (p) => p.location.postalCode },
  { key: 'location.state', label: 'State / region', locate: byAutomationId('addressSection_countryRegion'), value: (p) => p.location.state, kind: 'combobox', match: 'startsWith' },
  { key: 'contact.email', label: 'Email', locate: byAutomationId('email'), value: (p) => p.contact.email },
  { key: 'contact.phoneDeviceType', label: 'Phone device type', locate: byAutomationId('phone-device-type'), value: () => 'Mobile', kind: 'combobox', match: 'startsWith' },
  { key: 'contact.phoneCountryCode', label: 'Phone country code', locate: byAutomationId('country-phone-code'), value: (p) => p.location.country, kind: 'combobox', match: 'startsWith', typeToSearch: true },
  { key: 'contact.phone', label: 'Phone number', locate: byAutomationId('phone-number'), value: (p) => p.contact.phone },
  { key: 'answers.previousWorker', label: 'Previously worked here', locate: byAutomationId('previousWorker'), value: (p) => p.answers.previousWorker ?? 'No', kind: 'radio', match: 'startsWith' },

  // --- My Experience: first work entry ---
  { key: 'experience.0.title', label: 'Job title', locate: byAutomationId('jobTitle'), value: (p) => p.experience[0]?.title },
  { key: 'experience.0.company', label: 'Company', locate: byAutomationId('company'), value: (p) => p.experience[0]?.company },
  { key: 'experience.0.location', label: 'Work location', locate: byAutomationId('location'), value: (p) => p.experience[0]?.location },
  { key: 'experience.0.current', label: 'Currently work here', locate: byAutomationId('currentlyWorkHere'), value: (p) => p.experience[0]?.current, kind: 'checkbox' },
  { key: 'experience.0.startMonth', label: 'Start month', locate: byAutomationId('startDate-dateSectionMonth-input'), value: (p) => month(p.experience[0]?.startDate) },
  { key: 'experience.0.startYear', label: 'Start year', locate: byAutomationId('startDate-dateSectionYear-input'), value: (p) => year(p.experience[0]?.startDate) },
  { key: 'experience.0.endMonth', label: 'End month', locate: byAutomationId('endDate-dateSectionMonth-input'), value: (p) => (p.experience[0]?.current ? undefined : month(p.experience[0]?.endDate)) },
  { key: 'experience.0.endYear', label: 'End year', locate: byAutomationId('endDate-dateSectionYear-input'), value: (p) => (p.experience[0]?.current ? undefined : year(p.experience[0]?.endDate)) },
  { key: 'experience.0.description', label: 'Role description', locate: byAutomationId('description'), value: (p) => p.experience[0]?.description },

  // --- My Experience: first education entry ---
  { key: 'education.0.university', label: 'School', locate: byAutomationId('school'), value: (p) => p.education[0]?.university, typeToSearch: true, match: 'includes' },
  { key: 'education.0.degree', label: 'Degree', locate: byAutomationId('degree'), value: (p) => p.education[0]?.degree, kind: 'combobox', match: 'includes' },
  { key: 'education.0.field', label: 'Field of study', locate: firstOf(byAutomationId('field-of-study'), byAutomationId('fieldOfStudy')), value: (p) => p.education[0]?.field, typeToSearch: true, match: 'includes' },
  { key: 'education.0.gpa', label: 'GPA', locate: byAutomationId('gpa'), value: (p) => p.education[0]?.gpa },

  // --- Websites / social ---
  { key: 'links.linkedin', label: 'LinkedIn', locate: firstOf(byAutomationId('linkedinQuestion'), byLabel(/linkedin/i)), value: (p) => p.links.linkedin },
  { key: 'links.portfolio', label: 'Website', locate: firstOf(byAutomationId('website'), byLabel(/website|portfolio/i)), value: (p) => p.links.portfolio },

  // --- Application Questions (labels vary by tenant; these are the common phrasings) ---
  { key: 'workAuthorization.authorized', label: 'Authorized to work', locate: byLabel(/legally (authori[sz]ed|eligible) to work|work authori[sz]ation/i), value: (p) => yesNo(p.workAuthorization.authorized), match: 'startsWith' },
  { key: 'workAuthorization.requiresSponsorship', label: 'Requires sponsorship', locate: byLabel(/sponsorship/i), value: (p) => yesNo(p.workAuthorization.requiresSponsorship), match: 'startsWith' },
  { key: 'workAuthorization.willingToRelocate', label: 'Willing to relocate', locate: byLabel(/relocat/i), value: (p) => yesNo(p.workAuthorization.willingToRelocate), match: 'startsWith' },
  { key: 'workAuthorization.noticePeriod', label: 'Notice period', locate: byLabel(/notice period/i), value: (p) => p.workAuthorization.noticePeriod },
  { key: 'compensation.expected', label: 'Expected salary', locate: byLabel(/expected (salary|ctc|compensation)/i), value: (p) => p.compensation?.expected },
  { key: 'answers.howDidYouHear', label: 'How did you hear', locate: firstOf(byAutomationId('sourceSection'), byLabel(/how did you hear/i)), value: (p) => p.answers.howDidYouHear, kind: 'combobox', match: 'includes', typeToSearch: true },
];

/** Per-tenant tweaks: extra or replacement specs keyed by hostname. */
const TENANT_OVERRIDES: Record<string, FieldSpec[]> = {
  // 'acme.wd5.myworkdayjobs.com': [ ...specs ],
};

export const workday: Adapter = {
  name: 'workday',
  detect: (url) => /myworkday(jobs|site)\.com$/i.test(url.hostname),
  get fields() {
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const overrides = TENANT_OVERRIDES[host] ?? [];
    const overriddenKeys = new Set(overrides.map((s) => s.key));
    return [...common.filter((s) => !overriddenKeys.has(s.key)), ...overrides];
  },
  formControlSelector: 'input, select, textarea, button[aria-haspopup="listbox"], [data-automation-id][role="combobox"]',
};
