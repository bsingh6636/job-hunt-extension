import type { Adapter } from './Adapter';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workday } from './workday';

/** Order matters: the first adapter whose detect() passes wins. */
export const adapters: Adapter[] = [workday, greenhouse, lever];

export function detectAdapter(url: URL = new URL(location.href), doc: Document = document): Adapter | null {
  return adapters.find((a) => a.detect(url, doc)) ?? null;
}

export type { Adapter, FieldSpec } from './Adapter';
