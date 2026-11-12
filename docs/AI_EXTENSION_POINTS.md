# AI extension points

Each hook is a plain async function with a no-op default, so wiring a model in is implementation, not redesign. Call the LLM from the Phase 2 backend, never from the extension with a raw API key.

## 1. Semantic field matching (exists as a stub)

`src/content/autofill/ai/semanticMatch.ts`

- **Input**: `UnknownField[]` (label, name, id, tag, type, automationId) from `collectUnknownFields`, plus the profile.
- **Output**: `MappingProposal[]` with `profilePath`, `confidence`, `rationale`.
- **Today**: the engine appends proposals to `report.skipped` as "AI proposal (not applied)".
- **Next**: side panel shows proposals with Apply buttons; confirmed mappings are saved per hostname as a generated adapter override, so the model is consulted once per form.
- **Prompt shape**: give the model the field list and the list of profile paths with one example value each; ask for strict JSON; drop anything under 0.7 confidence; never let it invent values, only map paths.

## 2. Post ranking and summary

Place: `src/shared/posts.ts` after `applyKeywords`, or a background job over `postsRepo`.

- **Input**: `ExtractedPost.text`, `author.headline`, the candidate's target roles from the profile.
- **Output**: `relevance: 0..1`, `summary` (one line: role, stack, location, how to apply), `roleType`, `seniority`.
- Store on the post as `ai: { relevance, summary }`; the Posts tab gets a "sort by relevance" option.

## 3. Outreach drafting

Place: new `draftOutreach(post, profile)` used by a button on `PostCard`.

- **Input**: one post, the profile, the "standard answers" in `profile.answers` (why leaving, availability).
- **Output**: subject + body for a mailto link, or a LinkedIn message under 300 characters.
- Keep the rules from the profile handoff: lead with availability, never claim skills outside `profile.skills`.

## 4. Profile extraction (one-off tool)

The handoff document is prose. A script in Phase 2 can feed it to a model with `profile.schema.ts` and ask for `profile.json`, then validate with `parseProfile`. Until then the file is hand-written.

## 5. Adapter generation

Given `report.unknownFields` and the page's form HTML, ask the model to emit `FieldSpec[]` for a new adapter. Review by hand; adapters are small enough to read.
