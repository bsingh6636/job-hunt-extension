import type { FillReport, FillResult, Profile, UnknownField } from '@shared/types';
import { cssEscape, isVisible } from '@shared/utils/dom';
import type { Adapter, FieldSpec } from './adapters/Adapter';
import { hasValue, resolveKind, setCheckbox, setCombobox, setRadio, setSelect, setText } from './setters';
import { semanticMatch } from './ai/semanticMatch';

export interface FillOptions {
  /** Do not overwrite controls that already have a value. */
  fillEmptyOnly: boolean;
  /** Flash a green outline on filled controls. */
  highlight: boolean;
}

/**
 * Runs an adapter's field specs against the page and reports exactly what
 * happened. Pure orchestration: locating is the adapter's job, mutating is
 * the setters' job.
 */
export async function runFill(adapter: Adapter, profile: Profile, options: FillOptions, doc: Document = document): Promise<FillReport> {
  const report: FillReport = {
    adapter: adapter.name,
    url: doc.location?.href ?? '',
    ranAt: new Date().toISOString(),
    filled: [],
    skipped: [],
    unmatched: [],
    unknownFields: [],
  };
  const claimed = new Set<HTMLElement>();

  for (const spec of adapter.fields) {
    const result = await fillOne(spec, profile, options, doc, claimed);
    report[result.bucket].push(result.entry);
  }

  report.unknownFields = collectUnknownFields(doc, claimed, adapter.formControlSelector);

  // AI extension point: propose mappings for fields no spec claimed.
  // Returns [] until an LLM is wired in; see ai/semanticMatch.ts.
  const proposals = await semanticMatch(report.unknownFields, profile);
  for (const proposal of proposals) {
    report.skipped.push({ key: proposal.profilePath, label: proposal.field.label, reason: `AI proposal (not applied): ${proposal.rationale}` });
  }

  return report;
}

async function fillOne(
  spec: FieldSpec,
  profile: Profile,
  options: FillOptions,
  doc: Document,
  claimed: Set<HTMLElement>,
): Promise<{ bucket: 'filled' | 'skipped' | 'unmatched'; entry: FillResult }> {
  const base = { key: spec.key, label: spec.label };
  let el: HTMLElement | null;
  try {
    el = spec.locate(doc);
  } catch (err) {
    return { bucket: 'unmatched', entry: { ...base, reason: `locator threw: ${(err as Error).message}` } };
  }
  if (!el) return { bucket: 'unmatched', entry: { ...base, reason: 'not on this page' } };
  claimed.add(el);
  el.querySelectorAll<HTMLElement>('input, select, textarea, button').forEach((c) => claimed.add(c));

  const value = spec.value(profile);
  if (value === undefined || value === '') return { bucket: 'skipped', entry: { ...base, reason: 'no value in profile' } };
  if (options.fillEmptyOnly && hasValue(el)) return { bucket: 'skipped', entry: { ...base, reason: 'already filled' } };

  try {
    const kind = resolveKind(el, spec.kind);
    let applied: string;
    switch (kind) {
      case 'text':
        applied = await setText(el, String(value));
        break;
      case 'select':
        applied = await setSelect(el, String(value), spec.match);
        break;
      case 'checkbox':
        applied = await setCheckbox(el, typeof value === 'boolean' ? value : /^(yes|true|1)$/i.test(String(value)));
        break;
      case 'radio':
        applied = await setRadio(el, String(value), spec.match);
        break;
      case 'combobox':
        applied = await setCombobox(el, String(value), spec.match ?? 'startsWith', spec.typeToSearch);
        break;
    }
    if (options.highlight) flash(el);
    return { bucket: 'filled', entry: { ...base, value: applied } };
  } catch (err) {
    return { bucket: 'skipped', entry: { ...base, value: String(value), reason: (err as Error).message } };
  }
}

function flash(el: HTMLElement) {
  const target = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement ? el : el;
  const previous = target.style.outline;
  target.style.outline = '2px solid #22c55e';
  target.style.outlineOffset = '1px';
  setTimeout(() => {
    target.style.outline = previous;
  }, 4000);
}

/** Visible form controls no spec claimed, described well enough for a human or an LLM to map. */
export function collectUnknownFields(doc: Document, claimed: Set<HTMLElement>, selector = 'input, select, textarea, [role="combobox"]'): UnknownField[] {
  const seen = new Set<string>();
  const out: UnknownField[] = [];
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
    if (claimed.has(el) || !isVisible(el)) continue;
    const type = el instanceof HTMLInputElement ? el.type : undefined;
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') continue;
    const label = labelFor(el, doc);
    const key = `${el.tagName}|${label}|${el.getAttribute('name') ?? ''}|${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      name: el.getAttribute('name') ?? undefined,
      id: el.id || undefined,
      tag: el.tagName.toLowerCase(),
      type,
      automationId: el.getAttribute('data-automation-id') ?? undefined,
    });
  }
  return out;
}

export function labelFor(el: HTMLElement, doc: Document): string {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  if (el.id) {
    const label = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label?.textContent) return clean(label.textContent);
  }
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => clean(doc.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const wrapped = el.closest('label');
  if (wrapped?.textContent) return clean(wrapped.textContent);
  return clean(el.getAttribute('aria-label')) || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name')) || el.id || el.tagName.toLowerCase();
}
