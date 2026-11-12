/** Case-insensitive phrase matching used for post filtering. */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const haystack = text.toLowerCase();
  return keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && haystack.includes(k.toLowerCase()));
}

export function parseKeywordList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  );
}
