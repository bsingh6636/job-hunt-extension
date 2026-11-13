/**
 * Phone numbers in job posts, mostly Indian: "7087706624", "+91 70877 06624",
 * "+91-70877-06624", "080-4567 8901". Returned as "+<country><number>" so the
 * same number written two ways is stored once and can open a WhatsApp chat.
 */

/** A run of digits with spaces, dashes, dots or brackets between them. Newlines end a run. */
const RUN_RE = /\+?\d[\d \t().-]{8,22}\d/g;
const URLS_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAILS_RE = /\S+@\S+/g;

/** "+91 70877 06624" / "7087706624" -> "+917087706624"; anything that is not a phone number -> undefined. */
export function normalizePhone(raw: string): string | undefined {
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (plus) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : undefined;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`; // Indian mobile
  if (digits.length === 11 && /^0[6-9]/.test(digits)) return `+91${digits.slice(1)}`; // 0 + mobile, or 080 landline
  if (digits.length === 12 && /^91[6-9]/.test(digits)) return `+${digits}`;
  return undefined;
}

export function extractPhones(text: string): string[] {
  // Digits inside links and email addresses are not phone numbers.
  const clean = text.replace(URLS_RE, ' ').replace(EMAILS_RE, ' ');
  const found = new Set<string>();
  for (const match of clean.matchAll(RUN_RE)) {
    const run = match[0];
    const phone = normalizePhone(run);
    if (phone) {
      found.add(phone);
      continue;
    }
    // Two mobiles separated only by a space: "98765 43210 91234 56789".
    const digits = run.replace(/\D/g, '');
    if (!run.startsWith('+') && digits.length === 20) {
      for (const half of [digits.slice(0, 10), digits.slice(10)]) {
        const p = normalizePhone(half);
        if (p) found.add(p);
      }
    }
  }
  return [...found];
}

/** "+917087706624" -> "+91 70877 06624" for display; other numbers unchanged. */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Link that opens a WhatsApp chat with the number. */
export const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
