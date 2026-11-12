import { cssEscape, sleep, waitFor } from '@shared/utils/dom';
import type { FieldKind, MatchMode } from './adapters/Adapter';

/**
 * Setters put a value into one control the way a user would, so React,
 * Angular and Workday's own framework all notice the change. Each returns
 * the string that ended up in the control, or throws with a reason.
 */

const fire = (el: Element, type: string, init: EventInit = { bubbles: true }) => el.dispatchEvent(new Event(type, init));

/** React swaps the value setter on inputs; call the prototype's setter so its tracker sees the change. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function textsMatch(candidate: string, wanted: string, mode: MatchMode): boolean {
  const a = candidate.replace(/\s+/g, ' ').trim().toLowerCase();
  const b = wanted.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!a || !b) return false;
  switch (mode) {
    case 'exact':
      return a === b;
    case 'startsWith':
      return a.startsWith(b);
    case 'includes':
      return a.includes(b);
  }
}

/** Try exact first, then the requested mode, then includes. */
function pick<T>(items: T[], text: (item: T) => string, wanted: string, mode: MatchMode = 'exact'): T | undefined {
  const modes: MatchMode[] = Array.from(new Set<MatchMode>(['exact', mode, 'includes']));
  for (const m of modes) {
    const hit = items.find((item) => textsMatch(text(item), wanted, m));
    if (hit) return hit;
  }
  return undefined;
}

export function hasValue(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return el.value.trim().length > 0;
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim().length > 0;
  if (el instanceof HTMLSelectElement) return el.selectedIndex > 0 && el.value !== '';
  if (el.getAttribute('role') === 'radiogroup' || el.tagName === 'FIELDSET') {
    return !!el.querySelector('input[type="radio"]:checked');
  }
  // Workday prompt buttons show the chosen value as text; empty ones show "Select One" or nothing.
  const text = (el.textContent ?? '').trim().toLowerCase();
  return text.length > 0 && !/^(select one|select|choose|--)/.test(text);
}

export function resolveKind(el: HTMLElement, requested: FieldKind = 'auto'): Exclude<FieldKind, 'auto'> {
  if (requested !== 'auto') return requested;
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'text';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'radio') return 'radio';
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete')) return 'combobox';
    return 'text';
  }
  if (el.getAttribute('role') === 'radiogroup' || el.tagName === 'FIELDSET' || el.querySelector('input[type="radio"]')) return 'radio';
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox' || el.tagName === 'BUTTON') return 'combobox';
  const inner = el.querySelector<HTMLElement>('input, select, textarea');
  if (inner) return resolveKind(inner, 'auto');
  return 'text';
}

export async function setText(el: HTMLElement, value: string): Promise<string> {
  const target = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  if (!target) throw new Error('no text input inside element');
  target.focus();
  fire(target, 'focus', { bubbles: false });
  setNativeValue(target, value);
  fire(target, 'input');
  fire(target, 'change');
  fire(target, 'blur', { bubbles: false });
  return target.value;
}

export async function setSelect(el: HTMLElement, value: string, mode: MatchMode = 'exact'): Promise<string> {
  const select = el instanceof HTMLSelectElement ? el : el.querySelector('select');
  if (!select) throw new Error('no <select> inside element');
  const options = Array.from(select.options);
  const option = pick(options, (o) => o.value, value) ?? pick(options, (o) => o.text, value, mode);
  if (!option) throw new Error(`no option matching "${value}"`);
  select.focus();
  select.value = option.value;
  fire(select, 'input');
  fire(select, 'change');
  return option.text.trim();
}

export async function setCheckbox(el: HTMLElement, value: boolean): Promise<string> {
  const box = el instanceof HTMLInputElement ? el : el.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error('no checkbox inside element');
  if (box.checked !== value) box.click();
  return String(box.checked);
}

export async function setRadio(el: HTMLElement, value: string, mode: MatchMode = 'exact'): Promise<string> {
  let radios: HTMLInputElement[];
  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const scope = el.form ?? el.ownerDocument;
    radios = Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(el.name)}"]`));
  } else {
    radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  }
  if (radios.length === 0) throw new Error('no radio inputs found');
  const labelOf = (r: HTMLInputElement) => {
    const byFor = r.id ? r.ownerDocument.querySelector(`label[for="${cssEscape(r.id)}"]`) : null;
    const wrapped = r.closest('label');
    const aria = r.getAttribute('aria-label');
    return `${byFor?.textContent ?? ''} ${wrapped?.textContent ?? ''} ${aria ?? ''} ${r.value}`;
  };
  const radio = pick(radios, (r) => r.value, value) ?? pick(radios, labelOf, value, mode);
  if (!radio) throw new Error(`no radio option matching "${value}"`);
  if (!radio.checked) radio.click();
  return value;
}

/**
 * Custom dropdowns. Works for Workday prompts (button opens a listbox),
 * react-select (input with role=combobox) and plain ARIA comboboxes.
 */
export async function setCombobox(el: HTMLElement, value: string, mode: MatchMode = 'startsWith', typeToSearch = false): Promise<string> {
  const doc = el.ownerDocument;
  const trigger =
    el instanceof HTMLInputElement || el instanceof HTMLButtonElement
      ? el
      : el.querySelector<HTMLElement>('input, button, [role="combobox"]') ?? el;

  trigger.focus();
  if (trigger instanceof HTMLInputElement) {
    if (typeToSearch || trigger.getAttribute('role') === 'combobox') {
      setNativeValue(trigger, value);
      fire(trigger, 'input');
    } else {
      trigger.click();
    }
  } else {
    trigger.click();
  }

  const optionSelector = '[role="option"], [role="listbox"] li, [data-automation-id="promptOption"], [data-automation-id="selectOption"]';
  const options = await waitFor(() => {
    const list = Array.from(doc.querySelectorAll<HTMLElement>(optionSelector)).filter((o) => (o.textContent ?? '').trim());
    return list.length ? list : null;
  }, 2500);
  if (!options) throw new Error('dropdown did not open');

  const option = pick(options, (o) => o.textContent ?? '', value, mode);
  if (!option) {
    doc.body.click(); // close it
    throw new Error(`no option matching "${value}"`);
  }
  option.click();
  await sleep(150);
  return (option.textContent ?? value).trim();
}
