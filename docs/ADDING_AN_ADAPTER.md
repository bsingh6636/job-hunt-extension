# Adding an ATS adapter

An adapter is a data file. It never fills anything itself.

1. **Add the host** to `ATS_HOSTS` in `manifest.config.ts` (this updates both `host_permissions` and the content-script match list). Reload the extension.
2. **Create `src/content/autofill/adapters/<name>.ts`**:

```ts
import { profileDerived as d } from '@profile/profile.schema';
import type { Adapter } from './Adapter';
import { byId, byLabel, byName, firstOf, yesNo } from './Adapter';

export const ashby: Adapter = {
  name: 'ashby',
  detect: (url) => /(^|\.)ashbyhq\.com$/i.test(url.hostname),
  fields: [
    { key: 'identity.fullName', label: 'Name', locate: firstOf(byName('name'), byLabel(/^name/i)), value: (p) => d.fullName(p) },
    { key: 'contact.email', label: 'Email', locate: byLabel(/^e-?mail/i), value: (p) => p.contact.email },
    { key: 'workAuthorization.requiresSponsorship', label: 'Sponsorship', locate: byLabel(/sponsorship/i), value: (p) => yesNo(p.workAuthorization.requiresSponsorship), match: 'startsWith' },
  ],
};
```

3. **Register it** in `adapters/index.ts` (order matters: first `detect` wins).
4. **Run it** on a real posting with *only fill empty fields* on. The fill report lists each spec as filled / skipped (with the setter's reason) / not on page, plus *unknown fields* with their labels, names and ids. Use those to write the missing specs.
5. **Add a test** in `tests/` with a trimmed copy of the form's HTML and assert the report.

## FieldSpec cheat sheet

| Field | Meaning |
| --- | --- |
| `key` | Stable id for reports; use the profile path (`contact.email`) or a slug for synthetic values |
| `locate` | `(doc) => HTMLElement \| null`. Compose `byId`, `byName`, `byAutomationId`, `byLabel(/re/)`, `byAria(/re/)`, `byQuestion(/re/)`, `firstOf(...)` |
| `value` | `(profile) => string \| boolean \| undefined`. `undefined` = skip |
| `kind` | Usually omit (`auto`). Force `combobox` for custom dropdowns that look like buttons, `radio` when `locate` returns a container |
| `match` | For options: `exact` (default) then `startsWith`/`includes` as fallback |
| `typeToSearch` | Combobox inputs that show options only after typing (react-select, Workday school prompt) |

## Locator tips

- Prefer stable attributes (`id`, `name`, `data-automation-id`) and fall back to `byLabel`.
- `byLabel` returns the control for `<label for>`, a nested control, or the first control inside the label's container (radio groups).
- `byQuestion` returns the whole question block; the radio/select setter then searches inside it.
- Workday repeats automation ids per entry; scope with `bySelector('[data-automation-id="..."] >> nth')` in a later version.

## When the site renames things

Only the adapter file changes. If a setter needs a new interaction pattern (e.g. a date picker), add it to `setters.ts` and a new `FieldKind`.
