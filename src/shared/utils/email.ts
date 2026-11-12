/**
 * Email extraction tolerant of the obfuscation people use on LinkedIn:
 * "name [at] company [dot] com", "name (at) company.com", "name AT company DOT com".
 */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

export function deobfuscate(text: string): string {
  return text
    .replace(/\s*[\[({<]\s*at\s*[\])}>]\s*/gi, '@')
    // Bare "at" is only an obfuscated @ when a spelled-out "dot" follows ("jane at example dot com").
    .replace(/\s+at\s+(?=[a-z0-9-]+\s*(?:[\[({<]\s*dot\s*[\])}>]|\s+dot\s+))/gi, '@')
    .replace(/\s*[\[({<]\s*dot\s*[\])}>]\s*/gi, '.')
    .replace(/(?<=@[a-z0-9-]+)\s+dot\s+/gi, '.');
}

export function extractEmails(text: string): string[] {
  const found = new Set<string>();
  for (const source of [text, deobfuscate(text)]) {
    for (const match of source.matchAll(EMAIL_RE)) {
      const email = match[0].toLowerCase().replace(/[.,;:]+$/, '');
      // Skip image/file names that look like emails ("photo@2x.png").
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) continue;
      found.add(email);
    }
  }
  return [...found];
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Bare URLs typed into text, trailing punctuation removed. */
export function extractUrlsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    found.add(match[0].replace(/[.,;:!?)]+$/, ''));
  }
  return [...found];
}
