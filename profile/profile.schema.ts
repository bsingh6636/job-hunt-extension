import { z } from 'zod';

/**
 * Canonical candidate profile. Every ATS adapter maps form fields onto paths
 * in THIS shape (e.g. "identity.firstName"), never the other way round, so a
 * new form schema never changes the profile.
 *
 * Dates are "YYYY-MM" strings; adapters split them for month/year dropdowns.
 */
const monthDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const EducationSchema = z.object({
  /** Degree-granting body, e.g. "Visvesvaraya Technological University (VTU)". */
  university: z.string(),
  /** Campus/college when the form has a separate field for it. */
  institution: z.string().optional(),
  degree: z.string(),
  field: z.string(),
  startDate: monthDate,
  endDate: monthDate.optional(),
  gpa: z.string().optional(),
  location: z.string().optional(),
});

export const ExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  startDate: monthDate,
  endDate: monthDate.optional(),
  current: z.boolean().default(false),
  employmentType: z.enum(['full-time', 'part-time', 'internship', 'contract', 'freelance']).optional(),
  description: z.string().optional(),
});

export const ProfileSchema = z.object({
  identity: z.object({
    firstName: z.string(),
    lastName: z.string(),
    /** Display name as it should appear in a single "Full name" box. */
    fullName: z.string().optional(),
    preferredName: z.string().optional(),
  }),
  contact: z.object({
    email: z.string().email(),
    /** Digits only, no country code: "8050578803". */
    phone: z.string(),
    /** Country calling code without "+": "91". */
    phoneCountryCode: z.string().default('91'),
    /** ISO 3166-1 alpha-2 for phone country dropdowns: "IN". */
    phoneCountry: z.string().default('IN'),
  }),
  location: z.object({
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string(),
    countryCode: z.string().length(2),
  }),
  links: z.object({
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    portfolio: z.string().url().optional(),
    other: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  }),
  workAuthorization: z.object({
    /** Country the candidate is applying from / authorized in. */
    country: z.string(),
    authorized: z.boolean(),
    requiresSponsorship: z.boolean(),
    willingToRelocate: z.boolean().optional(),
    noticePeriod: z.string().optional(),
  }),
  compensation: z
    .object({
      currency: z.string().default('INR'),
      current: z.string().optional(),
      expected: z.string().optional(),
    })
    .optional(),
  education: z.array(EducationSchema).default([]),
  experience: z.array(ExperienceSchema).default([]),
  skills: z.array(z.string()).default([]),
  /**
   * Free-form answers for recurring screening questions, keyed by a short
   * slug adapters can reference: { "howDidYouHear": "LinkedIn", ... }.
   */
  answers: z.record(z.string(), z.string()).default({}),
  /** Metadata about this profile document. */
  meta: z
    .object({
      label: z.string().default('default'),
      updatedAt: z.string().optional(),
      source: z.string().optional(),
    })
    .default({ label: 'default' }),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileInput = z.input<typeof ProfileSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;

export function parseProfile(raw: unknown): { ok: true; profile: Profile } | { ok: false; errors: string[] } {
  const result = ProfileSchema.safeParse(raw);
  if (result.success) return { ok: true, profile: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** Derived values that many forms ask for but the profile stores in parts. */
export const profileDerived = {
  fullName: (p: Profile) => p.identity.fullName ?? `${p.identity.firstName} ${p.identity.lastName}`.trim(),
  phoneE164: (p: Profile) => `+${p.contact.phoneCountryCode}${p.contact.phone}`,
  phoneLocal: (p: Profile) => p.contact.phone,
  cityState: (p: Profile) => [p.location.city, p.location.state].filter(Boolean).join(', '),
  cityCountry: (p: Profile) => [p.location.city, p.location.country].filter(Boolean).join(', '),
  currentCompany: (p: Profile) => p.experience.find((e) => e.current)?.company ?? p.experience[0]?.company,
  currentTitle: (p: Profile) => p.experience.find((e) => e.current)?.title ?? p.experience[0]?.title,
  latestEducation: (p: Profile) => p.education[0],
  authorizedYesNo: (p: Profile) => (p.workAuthorization.authorized ? 'Yes' : 'No'),
  sponsorshipYesNo: (p: Profile) => (p.workAuthorization.requiresSponsorship ? 'Yes' : 'No'),
};
