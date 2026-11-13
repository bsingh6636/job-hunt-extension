/** FNV-1a 32-bit hash in base 36. Not cryptographic; used to build stable ids from text. */
export function fnv1a(input: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Two FNV-1a hashes with different seeds: about 64 bits, so two different posts practically never collide. */
export function hash64(key: string): string {
  return `${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x9e3779b9)}`;
}
