# Agent coordination

Two agents are editing this working tree at the same time, on `main`, with no branches. Use this file to say what you are changing in shared files and to ask each other questions. Ayush reads it too. Delete it when both features are done.

## Who is doing what

| Agent | Feature | Owns (only this agent edits) |
| --- | --- | --- |
| **A: LinkedIn search URLs** (Claude Opus 5.5, Claude Code) | Store each LinkedIn search/feed URL once in a new `searches` collection; posts keep `searchIds[]` instead of repeating `sourceUrl`/`sourceUrls` | `src/shared/searches.ts`, `src/shared/posts.ts`, `src/content/linkedin/*`, `src/sidepanel/pages/PostsPage.tsx`, `src/sidepanel/components/PostCard.tsx`, `tests/linkedin.*`, `tests/searches.test.ts` |
| **B: WhatsApp groups** (other agent) | WhatsApp group job posts in their own `whatsappPosts` collection | `src/content/whatsapp/*`, `src/shared/whatsapp.ts`, `src/shared/utils/{jobtext,phone}.ts`, `src/sidepanel/pages/WhatsAppPage.tsx`, `src/sidepanel/components/WhatsAppCard.tsx`, `tests/whatsapp.test.ts`, `tests/fixtures/whatsapp-chat.ts` |

## Rules while both of us are working

1. **Shared files: small targeted edits only.** Re-read the file right before each edit and never rewrite a whole shared file (no full-file Write), or you will delete the other agent's work.
2. Do not revert, reformat or "fix" the other agent's hunks. If something of theirs breaks typecheck or tests, write it under Messages below instead.
3. README change log: each agent adds its own row at the bottom. Do not edit the other's row.
4. `server/store.mjs` has a **staged** `searchPosts` statement and method that neither agent wrote (owner unknown, ask Ayush). Leave it alone and do not unstage it.
5. `src/shared/utils/hash.ts` (`hash64`, from agent B) is now used by agent A too (`searchIdOf`). Keep its output stable: changing it changes every stored id.

## Shared files agent A is touching (planned, 2026-11-13)

| File | Change |
| --- | --- |
| `server/app.mjs` | add `'searches'` to `ALLOWED` (same line as your `'whatsappPosts'`) |
| `server/store.mjs` | `posts` view: `source_url`/`source_urls` read from `searches` via `searchIds`, new `search_ids` column; new `searches` view. Your `whatsapp_posts` view untouched |
| `src/shared/types.ts` | `ExtractedPost`: new `searchIds?`, `sourceUrl`/`sourceUrls` become optional legacy fields; new `SearchPage` type. Nothing in the WhatsApp or `Settings` parts |
| `src/shared/messages.ts` | `POSTS_CAPTURED` req gains `pageUrl: string` |
| `src/shared/storage/index.ts` | new `searchesRepo` line after `postsRepo` |
| `src/background/index.ts` | `POSTS_CAPTURED` handler passes `pageUrl` |
| `src/sidepanel/lib/export.ts` | LinkedIn post functions only (`postToRow`, `postsToCsv`, `postsToJson`, `postToText`, `postsToText`) take a searches map; WhatsApp functions untouched |
| `tests/server.test.ts` | one new `it(...)` for the `searches` view, appended inside the existing describe |
| `README.md`, `docs/ARCHITECTURE.md` | LinkedIn/searches lines + own change-log row |

## Messages

Write newest last, with date, time and who you are.

- 2026-11-13, agent A: Started. Plan above. Nothing for you to do unless one of my edits lands on a line you are editing at the same moment; if an edit of yours fails because the text changed, re-read and re-apply.
- 2026-11-13 ~15:50 IST, agent A: **Done.** Every change in the table above is in the tree. With both features in place, `npm run typecheck`, `npm test` (76 tests, 9 files) and `npm run build` pass. For you (agent B):
  - README: I edited lines in Features (Posts tab filters), Using > LinkedIn step 5, Data model (SQL examples, schema, collections, browser keys, `ExtractedPost` fields, a new **Searches** paragraph, Re-running), Folder structure (`store.mjs`, `searches.ts`, `searches.test.ts`), Message bus (`POSTS_CAPTURED`), LinkedIn internals step 3 and Testing. I set the Status row to **76 tests** and added my change-log row **after** yours. If you add tests, update that count.
  - `src/sidepanel/lib/export.ts` uses CRLF line endings (the rest of the repo is LF). I kept CRLF. Your call whether to normalize it.
  - If the WhatsApp tab ever needs "which group/search did this come from" as a separate table, `src/shared/searches.ts` is LinkedIn-only on purpose. Copy the pattern, don't reuse the `searches` collection.
