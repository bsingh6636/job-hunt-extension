import type { Profile } from '@shared/types';
import { cssEscape } from '@shared/utils/dom';

/**
 * An adapter = detection rule + list of field specs. It is pure data plus
 * tiny locator functions: no DOM mutation, no storage, no UI. The engine
 * does the filling, so a new ATS is a new file in this folder and one line
 * in index.ts. See docs/ADDING_AN_ADAPTER.md.
 */

export type FieldKind =
  /** Inspect the element and pick the right setter (default). */
  | 'auto'
  | 'text'
  | 'select'
  | 'checkbox'
  /** `locate` returns the group container or any radio in the group. */
  | 'radio'
  /** Custom dropdown (Workday prompt, react-select). Opened then an option is clicked. */
  | 'combobox';

export type MatchMode = 'exact' | 'startsWith' | 'includes';

export interface FieldSpec {
  /** Stable key for reports, e.g. "identity.firstName". */
  key: string;
  /** Human label shown in the fill report. */
  label: string;
  kind?: FieldKind;
  /** Find the element on the page, or null when this step of the flow does not show it. */
  locate: (doc: Document) => HTMLElement | null;
  /** Value to fill. Return undefined to skip. */
  value: (profile: Profile) => string | boolean | undefined;
  /** How option text is compared for select/radio/combobox. Default: exact, then includes. */
  match?: MatchMode;
  /** For combobox inputs that need typing before options appear. */
  typeToSearch?: boolean;
}

export interface Adapter {
  /** Short id used in reports and the application log, e.g. "greenhouse". */
  name: string;
  detect: (url: URL, doc: Document) => boolean;
  fields: FieldSpec[];
  /** Selector for elements the "unknown fields" scan should consider. Defaults to all form controls. */
  formControlSelector?: string;
}

/* ------------------------------------------------------------------ */
/* Locator helpers. Compose them: firstOf(byId('email'), byLabel(/e-?mail/i)) */
/* ------------------------------------------------------------------ */

export type Locator = (doc: Document) => HTMLElement | null;

export const bySelector =
  (selector: string): Locator =>
  (doc) =>
    doc.querySelector<HTMLElement>(selector);

export const byId = (id: string): Locator => (doc) => doc.getElementById(id);

export const byName = (name: string): Locator => bySelector(`[name="${cssEscape(name)}"]`);

/** Workday and some others tag controls with data-automation-id. */
export const byAutomationId = (id: string): Locator => bySelector(`[data-automation-id="${cssEscape(id)}"]`);

/** Match a <label> by text and return the control it labels. */
export const byLabel =
  (pattern: RegExp): Locator =>
  (doc) => {
    const labels = Array.from(doc.querySelectorAll<HTMLLabelElement>('label'));
    for (const label of labels) {
      if (!pattern.test((label.textContent ?? '').replace(/\s+/g, ' ').trim())) continue;
      if (label.htmlFor) {
        const target = doc.getElementById(label.htmlFor);
        if (target) return target;
      }
      const nested = label.querySelector<HTMLElement>('input, select, textarea, [role="combobox"]');
      if (nested) return nested;
      // Label is a sibling heading of a control group (common for radio groups).
      const container = label.closest<HTMLElement>('fieldset, div');
      const control = container?.querySelector<HTMLElement>('input, select, textarea, [role="combobox"], [role="radiogroup"]');
      if (control) return control;
    }
    return null;
  };

/** aria-label / placeholder fallback for forms with no <label>. */
export const byAria =
  (pattern: RegExp): Locator =>
  (doc) => {
    const controls = Array.from(doc.querySelectorAll<HTMLElement>('input, select, textarea, [role="combobox"], button[aria-haspopup]'));
    return (
      controls.find((el) => {
        const text = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`;
        return pattern.test(text.trim());
      }) ?? null
    );
  };

/** Legend/heading text of a fieldset or question block, returning the block. */
export const byQuestion =
  (pattern: RegExp, blockSelector = 'fieldset, [role="group"], .application-question, [data-automation-id="formField"]'): Locator =>
  (doc) => {
    const blocks = Array.from(doc.querySelectorAll<HTMLElement>(blockSelector));
    for (const block of blocks) {
      const heading = block.querySelector('legend, label, .application-label, h3, h4, span');
      const text = (heading?.textContent ?? block.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (pattern.test(text)) return block;
    }
    return null;
  };

export const firstOf =
  (...locators: Locator[]): Locator =>
  (doc) => {
    for (const locate of locators) {
      const el = locate(doc);
      if (el) return el;
    }
    return null;
  };

/* Value helpers */

export const month = (yyyyMm: string | undefined) => (yyyyMm ? String(Number(yyyyMm.slice(5, 7))) : undefined);
export const monthPadded = (yyyyMm: string | undefined) => yyyyMm?.slice(5, 7);
export const year = (yyyyMm: string | undefined) => yyyyMm?.slice(0, 4);
export const yesNo = (value: boolean | undefined) => (value === undefined ? undefined : value ? 'Yes' : 'No');
