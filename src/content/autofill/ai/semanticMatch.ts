import type { Profile, UnknownField } from '@shared/types';

/**
 * AI EXTENSION POINT #1: semantic field matching.
 *
 * Input: form controls on the page that no adapter spec claimed, plus the
 * profile. Output: proposed (field -> profile path) mappings with a
 * rationale. The engine lists proposals in the fill report; a later phase
 * can apply them after the user confirms, and persist confirmed mappings
 * as a per-host adapter override so the LLM is asked only once per form.
 *
 * Phase 3 implementation sketch:
 *   - Send {fields: [{label, name, type}], profileKeys: [...]} to the backend
 *     (never call the LLM API from the extension with a raw key).
 *   - Ask for strict JSON: [{fieldIndex, profilePath, confidence, rationale}].
 *   - Drop anything below a confidence threshold.
 */
export interface MappingProposal {
  field: UnknownField;
  profilePath: string;
  confidence: number;
  rationale: string;
}

export async function semanticMatch(_fields: UnknownField[], _profile: Profile): Promise<MappingProposal[]> {
  return [];
}
