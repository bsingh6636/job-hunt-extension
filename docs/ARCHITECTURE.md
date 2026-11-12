# Architecture

```
manifest.config.ts        typed MV3 manifest (CRXJS builds every entry it references)
profile/                  candidate profile schema (Zod) + example + real file (git-ignored)
src/shared/               code every context may import; never touches the DOM of a page
  types.ts                ExtractedPost, Application, FillReport, Settings
  messages.ts             typed message bus (MessageMap + sendToTab/sendToRuntime/onMessage)
  storage/                Repository interface; LocalRepository (chrome.storage); ApiRepository (HTTP to local server); SwitchingRepository picks by settings
  posts.ts                merge + keyword tagging for captured posts
  utils/                  email regex, csv, dom helpers, keyword matching, logging
src/background/           service worker: message router, stores captured posts
src/content/linkedin/     selectors.ts (all selectors + STRUCT patterns), expand.ts, parse.ts, structure.ts (class-free), extract.ts (loop), diagnose.ts, sample.ts, index.ts
src/content/autofill/     adapters/ (data), setters.ts (mutation), engine.ts (orchestration), ai/ (hooks), index.ts
src/sidepanel/            React UI: Posts, Autofill, Profile, Log, Settings
server/                   local storage server: node:sqlite + node:http, zero deps, 127.0.0.1:4777; page sample files
tests/                    vitest + jsdom (extension) and node (server); fixtures are synthetic
```

## Contexts and who talks to whom

| Context | Runs where | Reads/writes storage | Talks to |
| --- | --- | --- | --- |
| Content script (LinkedIn) | linkedin.com tab | no | background (`POSTS_CAPTURED`), side panel (`LINKEDIN_EXTRACT_PROGRESS`) |
| Content script (autofill) | ATS tab | no | answers side panel (`AUTOFILL_DETECT`, `AUTOFILL_RUN`) |
| Background service worker | extension | yes | merges posts into `postsRepo` |
| Side panel | extension page | yes | asks content scripts via `chrome.tabs.sendMessage` |
| Local storage server | Node process on the laptop | owns the SQLite file | answers HTTP from background and panel in server mode |

Content scripts never touch storage so that the storage backend can change without touching page code. The background owns every write that can happen while the panel is closed. The panel subscribes through `Repository.subscribe`: in browser mode that is `chrome.storage.onChanged`; in server mode the writer broadcasts a `DATA_CHANGED` runtime message after each write and the panel refetches, since an HTTP server cannot push.

## Messages

`src/shared/messages.ts` declares a `MessageMap` of `{ req, res }` per message type. `sendToTab`/`sendToRuntime` are generic over that map, and `onMessage` only answers types it has a handler for, so background and side panel can both listen to the same runtime channel without stealing each other's responses.

## Data layer

`Repository<T>` (get/list/put/putMany/remove/removeMany/clear/subscribe) and `ValueStore<T>` are the only storage APIs used by the UI and background. Three implementations:

- `LocalRepository`: chrome.storage.local, key `collection:<name>`.
- `ApiRepository`: HTTP against `GET/PUT/DELETE /api/:collection[/:id]`, `POST /api/:collection/bulk`, `POST /api/:collection/bulk-delete`. Fetch failures become "Storage server not reachable at <url>. Start it with: npm run server".
- `SwitchingRepository` (in `src/shared/storage/index.ts`): reads `settings.storage.mode` on every call and delegates. Default mode is `server`. No caching: server mode never keeps posts in the browser.

Profile and settings always use `LocalValueStore`, because the settings decide the mode.

The server (`server/`) stores every collection in one `documents(collection, id, data JSON, created_at, updated_at)` table and exposes `posts` and `applications` SQL views for humans. It binds 127.0.0.1 only and allows CORS from any origin because the extension origin is not predictable. Phase 2 reuses `ApiRepository` against a remote host with auth added.

## Diagnose

`LINKEDIN_DIAGNOSE` (Posts tab > Diagnose page) returns hit counts for every selector in `selectors.ts`, generic probes, and an outline of the first cards (tags, classes, data attributes, text lengths; never text). It exists because selectors can only be tuned from a live page, and the agent fixing them may not have a browser. `docs/LIVE_TEST.md` is the procedure.

`LINKEDIN_SAMPLE` (Posts tab > Page sample) is the heavier tool: the full page HTML with scripts made inert, plus every post-id location. The panel POSTs it to the local server, which writes `server/data/samples/<id>.html` + `.json` and serves them at `/samples` with a CSP that blocks scripts. It falls back to a download when the server is down. Use it when the Diagnose report shows the markup changed shape, not just class names.

## Class-less LinkedIn markup

`structure.ts` detects posts without class names: the list whose children each hold an author link, enough text and social buttons; the author from the first profile link; the time from a "2d"-style label; the body as the longest text-only block between the time label and the Like button. When no post URN is in the DOM the id is a hash of author + text prefix and the link points at the author's activity page. All patterns live in `STRUCT` in `selectors.ts`. `findPostCards` tries class selectors, then URN attributes, then structure; `parsePostCard` mixes per field, so a page with classes but no URN still works.

## LinkedIn extraction flow

1. Side panel sends `LINKEDIN_EXTRACT_START` with options from Settings and `mode`: `fresh` (Extract N from the top) or `more` (next `moreBatch` posts not yet sent from this page; the content script keeps a page session until the URL changes).
2. Content script (`extract.ts`, `runExtraction`) loops: `expandAll()` clicks every "...more", `findPostCards()` returns top-level cards, `parsePostCard()` turns each into an `ExtractedPost`.
3. Posts whose text grew since last send are re-sent; background `mergePost` keeps the longest text, unions emails, takes links from the parse with the most text (unions them only for a shorter parse), and preserves `status` and `notes`.
4. `scrollForMore()` scrolls the window and the last post into view, clicks "Show more results" (by selector or by text), and waits for the page or `<main>` to grow, after a random `pauseMinMs`..`pauseMaxMs` pause. Each batch is stored as soon as it is parsed. Stops after the run's count, three idle rounds, or `LINKEDIN_EXTRACT_STOP`.

The post timestamp comes from the activity id (top 41 bits are epoch ms), which is exact where LinkedIn shows "3d".

## Autofill flow

1. Side panel sends `AUTOFILL_DETECT`; the content script picks the first adapter whose `detect(url)` passes.
2. `AUTOFILL_RUN` carries the profile. `runFill` walks each `FieldSpec`: `locate(doc)` -> value from profile -> `resolveKind` -> setter. Every outcome lands in one of `filled`, `skipped` (with reason), `unmatched`.
3. `collectUnknownFields` lists visible controls no spec claimed. These go to `ai/semanticMatch.ts`, the first AI hook.
4. The side panel stores the `FillReport` and records an `Application` in the log.

Setters use the native value setter + `input`/`change` events so React-controlled inputs keep the value. Comboboxes are opened and an option is clicked, matching text by exact -> startsWith -> includes.
