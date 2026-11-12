# Job Hunt Assistant (Chrome extension, Manifest V3)

A modular Chrome extension that streamlines job hunting. Phase 1 (this repo, extension only) ships two features in one side panel. Later phases add a backend and AI.

> **For AI agents and contributors:** read [Rules for making changes](#rules-for-making-changes) before editing anything. This README is the single source of truth for the project; every change that alters behaviour, structure, or setup must update it in the same change.

---

## Table of contents

1. [Features](#features)
2. [Status](#status)
3. [Setup](#setup)
4. [Loading in Chrome](#loading-in-chrome)
5. [Candidate profile](#candidate-profile)
6. [Using the extension](#using-the-extension)
7. [Settings reference](#settings-reference)
8. [Data model and storage](#data-model-and-storage)
9. [Architecture](#architecture)
10. [Folder structure](#folder-structure)
11. [Message bus](#message-bus)
12. [LinkedIn extraction internals](#linkedin-extraction-internals)
13. [Autofill internals](#autofill-internals)
14. [Testing](#testing)
15. [Roadmap](#roadmap)
16. [AI extension points](#ai-extension-points)
17. [Known limits and caveats](#known-limits-and-caveats)
18. [Troubleshooting](#troubleshooting)
19. [Rules for making changes](#rules-for-making-changes)
20. [Change log](#change-log)

---

## Features

### A. LinkedIn post and contact extractor

Run a LinkedIn search such as `"hiring" AND "2+ years" AND "node.js" NOT "open to work"`, open the side panel, click **Extract posts from this tab**. The extension:

- scrolls the page and clicks every "...more" so truncated posts are fully expanded
- captures **every detail of every post**, not only the ones with an email:
  - author name, headline, profile URL
  - post URL and the exact timestamp (decoded from the activity id, more precise than LinkedIn's "3d")
  - the full post text with line breaks preserved
  - every link in the post or attached article (LinkedIn redirect wrappers `/redir/redirect` and `/safety/go` unwrapped, tracking params removed, LinkedIn navigation and words LinkedIn auto-links such as "B.Tech" or "Node.js" dropped)
  - every email address, including obfuscated forms like `name [at] company [dot] com` and `mailto:` links
- tags each post with the **include keywords** it matches and the **exclude keywords** it matches (see Settings)
- stores everything locally and deduplicates by post id, so re-running on the same search adds only new posts and never overwrites your status or notes

On the **Posts** tab you can then:

- filter by keyword chip, "has email", status (new / reviewed / contacted / ignored), hide excluded, free-text search
- click an email to copy it, or press **Email** to open a mailto draft
- **Copy all details** of a post (author, profile, post URL, date, emails, links, keywords, status, notes, full text) for pasting into an email or notes
- set a status and write notes per post (who you contacted, what they said)
- export the filtered set as **CSV**, **JSON**, or plain **text**, to clipboard or as a download
- delete the shown posts or clear everything

### B. ATS application autofill

On a Greenhouse, Lever, or Workday application page, the **Autofill** tab detects the platform, reports how many known fields are visible on the current step, and **Fill this page** fills them from the stored candidate profile. Each run produces a report:

- **Filled**: field and the value that landed in it (flashed green on the page)
- **Skipped**: field, intended value, and the reason (already filled, no value in profile, option not found, dropdown did not open)
- **Not on this page**: specs the adapter knows that this step does not show
- **Unknown fields**: visible controls no spec claimed, with label, name, id, and automation id. This is the input for manual adapter tuning and for the AI matching hook.

Running autofill also records the application in the **Log** tab (company derived from the URL, page title, platform, status, notes).

---

## Status

| Area | State as of 2026-11-13 |
| --- | --- |
| Build, type check, unit tests | Passing (`npm run build`, `npm test`, 42 tests incl. server round trip) |
| Local SQLite server | Built and tested (unit + smoke). `npm run server` |
| Loaded in Chrome | Loaded by Ayush; first extraction attempt captured nothing (cause not yet known, Diagnose page added to find out) |
| LinkedIn extraction on a live page | **Working on content search, with gaps.** First live run of the structural fallback (2026-11-13) stored 37 posts: author, profile, text, emails and approximate time correct on 34. Fixed after that run: video posts stored the video player's control text as the post body, `/safety/go` links were not unwrapped. Still open: no post link in the page for most posts (see Known limits). Not yet tried on the feed. No page sample saved yet |
| Greenhouse / Lever / Workday adapters | **Not yet verified** against real postings; written from each platform's known field ids |
| Backend / sync | Not started (Phase 2) |
| AI features | Hooks only, no model wired (Phase 3) |

---

## Setup

Requirements: Node 20+ (built with Node 24), npm, Chrome 114+ (side panel API).

```bash
cd projects/job-hunt-extension
npm install
npm run server     # local SQLite storage server on http://127.0.0.1:4777 (keep it running)
npm run dev        # writes dist/ and keeps it updated with HMR
npm run build      # type-check + production build into dist/
npm run typecheck  # tsc --noEmit only
npm test           # vitest (jsdom for extension code, node for the server)
npm run test:watch
```

The dev server uses port 5174 (`vite.config.ts`); change it there if the port is taken. The storage server uses port 4777 (`PORT` env var) and writes to `server/data/jobhunt.sqlite` (`JOBHUNT_DB` env var). It needs no npm packages: it uses Node's built-in `node:sqlite` (Node 22.13+ or 24).

## Loading in Chrome

1. Run `npm run build` (or `npm run dev`).
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** and pick the `dist/` folder.
4. Click the toolbar icon on any tab. The side panel opens. It switches to the Posts tab automatically on LinkedIn and to Autofill on a supported ATS host.

After a production build or any change to `manifest.config.ts`, press the reload icon on the extension card. In dev mode, content scripts and the panel reload on save, but a tab that was open before the extension loaded still needs a page reload (the panel tells you when that is the case).

---

## Candidate profile

The profile is a JSON document validated by `profile/profile.schema.ts` (Zod). It is the canonical shape every ATS adapter maps onto, so adding a new form never changes the profile.

1. Copy `profile/profile.example.json` to `profile/profile.json` and fill it in. `profile/profile.json` is **git-ignored**; it holds personal data (phone, salary).
2. Side panel > **Profile** > **Import JSON** and pick the file, or **Edit JSON** and paste. Validation errors are listed field by field.
3. **Export** downloads the stored copy; **Load example** loads the fake example to see the shape.

Shape summary (see the example file for a full document):

| Section | Fields |
| --- | --- |
| `identity` | firstName, lastName, fullName, preferredName |
| `contact` | email, phone (digits only), phoneCountryCode ("91"), phoneCountry ("IN") |
| `location` | addressLine1/2, city, state, postalCode, country, countryCode |
| `links` | linkedin, github, portfolio, other[] |
| `workAuthorization` | country, authorized, requiresSponsorship, willingToRelocate, noticePeriod |
| `compensation` | currency, current, expected |
| `education[]` | university, institution, degree, field, startDate (YYYY-MM), endDate, gpa, location |
| `experience[]` | company, title, location, startDate, endDate, current, employmentType, description |
| `skills[]` | free strings |
| `answers` | map of slug to answer for recurring questions: howDidYouHear, previousWorker, gender, pronouns, whyLeaving, ... |
| `meta` | label, updatedAt, source |

Order `experience` and `education` most recent first; adapters fill the first entry. `university` is the degree-granting body; `institution` is the campus, used only when a form has a separate field for it.

The profile for Brijesh was transcribed by hand from `Downloads/resume/04_Source_Files/Profile_Handoffs/Brijesh_Kushwaha_Profile_Handoff_Latest.md` (dated 2026-11-07). That handoff is prose, not structured data, which is why the extension reads a JSON file rather than the handoff itself.

---

## Using the extension

### LinkedIn

1. Open the feed or a content search (`linkedin.com/search/results/content/?keywords=...`).
2. Side panel > **Posts** > **Extract posts from this tab**. Progress shows the count. **Stop** at any time.
3. Extraction ends when the post limit from Settings is reached, nothing new loads after three scrolls, or you stop it.
4. Review on the Posts tab. Posts matching an exclude keyword are hidden by default (untick "hide excluded" to see them).

### Autofill

1. Open an application page on a supported host (listed in `manifest.config.ts` under `ATS_HOSTS`).
2. Side panel > **Autofill**. It shows the detected adapter and visible field count.
3. Tick **only fill empty fields** (default on) and **highlight filled fields** (default on).
4. **Fill this page**. Read the report. On Workday repeat on each step (My Information, My Experience, Application Questions).
5. Review every field on the page before submitting. The extension never submits.

### Log

Applications appear here after autofill, or add one by URL. Status values: draft, applied, screening, interview, offer, rejected, withdrawn. Export as JSON.

---

## Settings reference

| Setting | Default | Effect |
| --- | --- | --- |
| Include keywords | hiring, node.js, nodejs, react, full stack, backend, mern, immediate joiner, bengaluru, bangalore | Case-insensitive phrase match against post text + author headline. Hits are shown as chips and usable as filters |
| Exclude keywords | open to work, looking for a job | Matching posts are stored but hidden by default |
| Store only posts that hit an include keyword | off | When on, the background drops non-matching new posts instead of storing them |
| Stop after N posts | 200 | Extraction limit per run |
| Wait after each scroll (ms) | 1500 | How long to wait for LinkedIn to render more posts |
| Scroll to load more | on | Off = capture only what is already on screen |
| Click "...more" | on | Expand truncated posts before capture |
| Only fill empty fields | on | Autofill never overwrites a value |
| Highlight filled fields | on | Green outline for 4 seconds |

Saving settings re-tags every stored post with the new keyword lists.

---

## Data model and storage

Two places, chosen in Settings > Storage:

| Mode | Where | Default |
| --- | --- | --- |
| `server` | SQLite file `server/data/jobhunt.sqlite` on this laptop, via `npm run server` on `http://127.0.0.1:4777` | yes |
| `browser` | `chrome.storage.local` inside Chrome | fallback |

Profile and settings always stay in `chrome.storage.local` (the settings decide the mode, so they cannot live behind it). Switching the mode does not move data already stored.

**Server mode.** The extension never caches posts in the browser; every read and write goes to the server. The background writes captured posts, the panel reads them, and a `DATA_CHANGED` runtime message tells the panel to refetch after any write. If the server is down, the Posts tab shows a red banner and **Extract** refuses to start, so nothing is silently lost. Browse the file with any SQLite client; two views make it readable without JSON functions:

```sql
SELECT author, posted_at, emails, status, substr(text, 1, 80) FROM posts ORDER BY posted_at DESC;
SELECT author, profile_url, post_url, url_kind, posted_at, posted_at_approx, captured_at, last_seen_at, source_urls FROM posts;
SELECT company, status, url FROM applications;
```

Schema: one `documents(collection, id, data JSON, created_at, updated_at)` table plus the `posts` and `applications` views (`server/store.mjs`). The `posts` view is dropped and recreated on every server start, so new columns appear after a restart. Routes are listed in `server/app.mjs`: `GET/PUT/DELETE /api/:collection/:id`, `GET/DELETE /api/:collection`, `POST /api/:collection/bulk`, `POST /api/:collection/bulk-delete`, `GET /health`. Collections: `posts`, `applications`, `fillReports`. The server binds to 127.0.0.1 only.

**Page samples** are files, not database rows: `server/data/samples/<id>.html` (full page, scripts disabled) and `<id>.json` (url, time, note, id scan, inventories). Override the folder with `JOBHUNT_SAMPLES`. Routes: `GET /samples` (browser index), `GET /samples.json`, `POST /samples` (body `{ meta, html }`), `GET /samples/:id.html` (served with a Content-Security-Policy that blocks all scripts), `GET /samples/:id.json`, `DELETE /samples/:id` (`server/samples.mjs`).

**Browser mode** keys: `collection:posts`, `collection:applications`, `collection:fillReports` (each a `Record<id, item>`), `value:profile`, `value:settings`.

Types are in `src/shared/types.ts`. `ExtractedPost` fields: id (`activity:<n>`, `ugcPost:<n>`, or `text:<hash>` when the page shows no post id), url, urlKind (`post`, `author-activity`, `search`), postedAtApprox, author {name, headline, profileUrl}, text, emails[], links[], postedAt (ISO), postedAtLabel ("3d"), capturedAt (first time an extraction saw it), lastSeenAt (latest time), sourceUrl (first search page that showed it), sourceUrls[] (every search page that showed it), matchedKeywords[], excludedBy[], status, notes. Posts stored before 2026-11-13 have no lastSeenAt/sourceUrls until seen again; exports and the `posts` view fall back to capturedAt/[sourceUrl].

**Re-running extraction** on the same or a different search never duplicates a post that keeps its id: it updates text (longest wins), links, lastSeenAt and sourceUrls, and keeps status, notes, capturedAt and sourceUrl. CSV/JSON exports and `GET /api/posts` contain every field above, which is what another tool or AI needs to review posts.

The storage API is the `Repository<T>` interface (`get/list/put/putMany/remove/removeMany/clear/subscribe`) and `ValueStore<T>`. `LocalRepository` implements it over chrome.storage, `ApiRepository` over the server routes, and `SwitchingRepository` (in `src/shared/storage/index.ts`) routes each call to one of them based on the current settings. Call sites only ever see `postsRepo`, `applicationsRepo`, `fillReportsRepo`. Phase 2 points `ApiRepository` at a remote backend with the same routes plus auth.

---

## Architecture

Three contexts, strict separation:

| Context | Runs in | Touches storage | Talks to |
| --- | --- | --- | --- |
| LinkedIn content script | linkedin.com tab | no | background (`POSTS_CAPTURED`), side panel (`LINKEDIN_EXTRACT_PROGRESS`) |
| Autofill content script | ATS tab | no | answers the side panel (`AUTOFILL_DETECT`, `AUTOFILL_RUN`) |
| Background service worker | extension | yes | merges captured posts into storage |
| Side panel (React) | extension page | yes | sends commands to content scripts via `chrome.tabs.sendMessage` |
| Local storage server | Node process on the laptop | owns the SQLite file | answers HTTP from background and panel (server mode) |

Design rules:

- Content scripts never touch storage, so the backend can change without touching page code.
- The background owns every write that can happen while the panel is closed.
- The panel subscribes to storage changes, so the list updates live while extraction streams in.
- Every third-party selector lives in exactly one file per site.
- Adapters are data; setters mutate; the engine orchestrates. No layer reaches across.

Stack: Vite 7, `@crxjs/vite-plugin` 2 (bundles MV3 entries, HMR), TypeScript strict, React 19 (side panel only), Zod 4 (profile validation), Vitest + jsdom.

---

## Folder structure

```
job-hunt-extension/
├── manifest.config.ts            typed MV3 manifest; ATS_HOSTS and LINKEDIN_HOSTS lists
├── vite.config.ts / vitest.config.ts / tsconfig.json
├── package.json
├── .gitignore                    excludes dist/, node_modules/, profile/profile.json
├── README.md                     this file (source of truth)
├── CLAUDE.md                     pointer for Claude Code sessions to the rules below
├── profile/
│   ├── profile.schema.ts         Zod schema, Profile type, parseProfile(), profileDerived helpers
│   ├── profile.example.json      committed, fake data
│   └── profile.json              real, git-ignored
├── server/                       local storage server (no dependencies)
│   ├── index.mjs                 entry: npm run server, port 4777
│   ├── app.mjs                   HTTP routes + CORS
│   ├── store.mjs                 SQLite documents table + posts/applications views
│   ├── samples.mjs               page sample files + browser index
│   └── data/                     git-ignored: jobhunt.sqlite, samples/
├── src/
│   ├── shared/
│   │   ├── types.ts              ExtractedPost, Application, FillReport, Settings, DEFAULT_SETTINGS
│   │   ├── messages.ts           MessageMap, sendToTab, sendToRuntime, onMessage
│   │   ├── posts.ts              mergePost, applyKeywords, mergeCapturedPosts, rematchAllPosts
│   │   ├── storage/              Repository.ts, LocalRepository.ts, ApiRepository.ts (HTTP), index.ts (SwitchingRepository)
│   │   └── utils/                email.ts, csv.ts, dom.ts, keywords.ts, log.ts
│   ├── background/index.ts       service worker: router, side panel behaviour
│   ├── content/
│   │   ├── linkedin/
│   │   │   ├── selectors.ts      EVERY LinkedIn selector, incl. fallback lists
│   │   │   ├── expand.ts         click "...more", scroll, "Show more results"
│   │   │   ├── parse.ts          pure DOM -> ExtractedPost (unit-tested), with fallbacks
│   │   │   ├── diagnose.ts       page structure report for fixing selectors (no text)
│   │   │   ├── structure.ts      class-free card/author/text/time detection for the newer markup
│   │   │   ├── sample.ts         full page sample (HTML + id scan) sent to the server
│   │   │   └── index.ts          entry: extraction loop, messages
│   │   └── autofill/
│   │       ├── adapters/         Adapter.ts (interface + locators), greenhouse.ts, lever.ts, workday.ts, index.ts (registry)
│   │       ├── setters.ts        text / select / checkbox / radio / combobox
│   │       ├── engine.ts         runFill, collectUnknownFields, labelFor
│   │       ├── ai/semanticMatch.ts   AI hook (returns [])
│   │       └── index.ts          entry: detect + run messages
│   └── sidepanel/
│       ├── index.html, main.tsx, App.tsx, styles.css
│       ├── lib/                  hooks.ts, export.ts (CSV/JSON/text/clipboard), tabs.ts, server.ts (status), samples.ts (upload)
│       ├── components/PostCard.tsx
│       └── pages/                PostsPage, AutofillPage, ProfilePage, LogPage, SettingsPage
├── tests/
│   ├── fixtures/linkedin-post.ts synthetic LinkedIn markup built from selectors.ts
│   ├── linkedin.parse.test.ts
│   ├── linkedin.structure.test.ts class-less markup fixture: cards, author, text, ids, expand, diagnose privacy
│   ├── linkedin.sample.test.ts   full page capture, scripts disabled, id scan
│   ├── autofill.engine.test.ts
│   ├── server.test.ts            starts the real server on a random port
│   └── utils.test.ts
└── docs/
    ├── ARCHITECTURE.md
    ├── ADDING_AN_ADAPTER.md
    ├── AI_EXTENSION_POINTS.md
    └── LIVE_TEST.md              step-by-step live test for a person or agent (Codex etc.)
```

Path aliases: `@shared/*` -> `src/shared/*`, `@profile/*` -> `profile/*` (set in tsconfig, vite and vitest configs).

---

## Message bus

`src/shared/messages.ts` declares a `MessageMap` with `{ req, res }` per message. Senders and handlers are generic over it, so a typo or payload mismatch fails at compile time. `onMessage` only answers message types it has a handler for, which lets background and side panel listen on the same channel.

| Message | From -> To | Purpose |
| --- | --- | --- |
| `PING` | any | liveness check, returns where it answered |
| `LINKEDIN_EXTRACT_START` | panel -> LinkedIn content | start with `ExtractOptions` |
| `LINKEDIN_EXTRACT_STOP` | panel -> LinkedIn content | stop after the current round |
| `LINKEDIN_STATUS` | panel -> LinkedIn content | running flag + post count on page |
| `LINKEDIN_DIAGNOSE` | panel -> LinkedIn content | selector hit counts + structural outline of the first cards (no text), for fixing selectors |
| `LINKEDIN_SAMPLE` | panel -> LinkedIn content | full page HTML (scripts disabled) plus every post-id location; the panel POSTs it to the server's `/samples`, or downloads it if the server is down |
| `DATA_CHANGED` | any writer -> everyone | a collection changed; panel refetches (needed in server mode, which cannot push) |
| `LINKEDIN_EXTRACT_PROGRESS` | content -> panel | progress broadcast |
| `POSTS_CAPTURED` | content -> background | batch of parsed posts; returns stored/dropped counts |
| `AUTOFILL_DETECT` | panel -> autofill content | adapter name + visible known fields |
| `AUTOFILL_RUN` | panel -> autofill content | profile + options; returns `FillReport` |

To add a message: add a key to `MessageMap`, a handler in the receiving context, and a sender call. Nothing else.

---

## LinkedIn extraction internals

1. The panel reads `settings.extract` and sends `LINKEDIN_EXTRACT_START`.
2. The content script loops: `expandAll()` clicks every "...more" button (by class, by aria-label, or by button text as a fallback), `findPostCards()` returns top-level cards (nested reshares excluded), `parsePostCard()` builds an `ExtractedPost`.
3. A post is re-sent when its text grew since the last send (it was expanded). The background `mergePost` keeps the longest text, unions emails, takes the links from the parse with the longest text (so re-extracting after a parser fix replaces wrong links; a shorter parse only adds links), keeps the first captured status and notes, and re-applies keyword tags. Re-extracting never removes a stored post: a post whose id changes (its text changed) is stored as a new row next to the old one.
4. `scrollForMore()` scrolls the window to the bottom and scrolls the last post into view (which also scrolls an inner results container, if LinkedIn uses one), clicks any "Show more results" button (known selectors, else a button in `<main>` whose text or aria-label matches `SEL.loadMoreTextPattern`, e.g. "Show more results", "Load more posts"), and waits up to `scrollDelayMs` for growth. Growth = page height, `<main>` height or `<main>` link count went up.
5. Stops on: post limit, three idle rounds with no growth, stop request, or error. Every stop reports a message to the panel.

Post id and URL come from the `data-urn` / `data-id` / `componentkey` / `data-entity-urn` attribute (`urn:li:activity:<id>`, also inside `urn:li:aggregate:(...)` wrappers). The timestamp is `Number(BigInt(id) >> 22n)` milliseconds since epoch (ids are 63 bits; the top 41 are the time).

**Fallbacks when LinkedIn renames classes** (`parse.ts`): if no card selector matches, any element whose data attribute carries a post URN is treated as a card (outermost only). If no text selector matches, the longest text block among `[class*="commentary"]`, `[class*="break-words"]`, `[class*="description"]`, `[dir="ltr"]` wins, excluding actor/social/comment blocks and the video player (`.video-js`, `vjs-*`; its control bar also has `dir="ltr"`).

**Structural fallback for the class-less markup** (`structure.ts`, patterns in `STRUCT` in `selectors.ts`). Used when neither of the above finds cards. LinkedIn's content search switched to this markup by 2026-11-12.

- **Cards:** the list whose children each have an author link (`/in/`, `/company/`, `/school/`), at least 60 characters of text, and a social button (Like/Comment/Repost/Send) or three buttons. The list with the most such children wins. Other non-overlapping lists are kept for results loaded in chunks. Comment lists inside a card and "people you may know" blocks are dropped.
- **Author:** the first profile link in the card; the name is its first text that is not a degree marker like "• 3rd+". The headline is the next header line before the time label and post body. The profile URL has its tracking query removed.
- **Time:** the first "2d", "1w", "5h", "1mo", "2 days ago" text in the card. `postedAt` is then estimated from it and `postedAtApprox` is true.
- **Body:** a `data-testid` text box if present, else the longest block made only of text markup after the time label, before the Like button, outside the author links and outside the video player. "…more" toggles inside it are skipped.
- **Id and link:** a post URN in any attribute (plain, or URL-encoded such as a group link's `highlightedUpdateUrn=urn%3Ali%3Aactivity%3A…`) or a `/posts/...-activity-<id>` link if one exists. Otherwise the id is `text:<hash>` of the author plus the first 40 letters of the text, which stays stable when "…more" expands it, and `url` points at the author's activity page (`urlKind: "author-activity"`). The panel labels that link "author's posts".
- **"…more":** besides `<button>`, small `span`/`div`/`[role=button]` elements inside `<main>` whose text is "…more" are clicked, innermost first, once each.

**Diagnose page** (Posts tab) sends `LINKEDIN_DIAGNOSE` and copies a JSON report to the clipboard: which strategy found cards (`class`, `urn-attribute`, `structure`, `none`), hit counts for every selector, generic probes, which attributes carry post ids, `componentkey`/`data-testid`/role inventories, button labels, non-button "more" toggles, and an outline of the first two cards. Names, headlines and text appear only masked (lowercase letters become `x`), profile slugs as `/in/*`, so the report is safe to paste into a chat. Paste it to whoever is fixing `selectors.ts`. Full procedure in `docs/LIVE_TEST.md`.

**Save page sample** (Posts tab > Page sample) goes further: it captures the **full page HTML** and sends it to the local server, which saves `server/data/samples/<id>.html` and `<id>.json`. In the saved copy, executable scripts are turned into inert text (content kept for analysis), external script sources and iframes are removed, CSRF meta tags are dropped, and a `<base>` points at linkedin.com so the page renders. The `.json` holds every attribute, link and inline script containing a post id, `componentkey`/`data-testid`/role inventories, button labels and a notes field for ground truth such as real post links. Browse samples at `http://127.0.0.1:4777/samples`; pages are served with scripts blocked. If the server is down the panel downloads one JSON file to Downloads instead. Samples contain other people's post text and your own LinkedIn page chrome, so they stay on the laptop (git-ignored).

---

## Autofill internals

`FieldSpec` = `{ key, label, locate(doc), value(profile), kind?, match?, typeToSearch? }`. Locators compose: `byId`, `byName`, `byAutomationId`, `byLabel(/re/)`, `byAria(/re/)`, `byQuestion(/re/)`, `firstOf(...)`.

`runFill` for each spec: locate -> value -> `resolveKind` (select, text, checkbox, radio, combobox from the element unless forced) -> setter. Outcomes: filled, skipped (with reason), unmatched. Then `collectUnknownFields` lists visible controls no spec claimed, and `semanticMatch` (AI hook) is asked for proposals, which are listed but not applied.

Setters use the native value setter plus `input`/`change` events so React-controlled inputs keep the value. Comboboxes are opened (click, or type when `typeToSearch`) and an option is clicked, matching text exact -> startsWith -> includes.

Adapter coverage:

| Adapter | Hosts | Fields |
| --- | --- | --- |
| greenhouse | boards.greenhouse.io, job-boards.greenhouse.io, job-boards.eu.greenhouse.io | name, email, phone, location, LinkedIn/GitHub/portfolio, current company, work auth, sponsorship, school/degree/discipline (react-select), how did you hear |
| lever | jobs.lever.co | full name, email, phone, current company, location, LinkedIn/GitHub/portfolio URLs, work auth, sponsorship, notice period, expected/current compensation (custom questions by label) |
| workday | *.myworkdayjobs.com, *.myworkdaysite.com | legal/preferred name, address, email, phone device type / country code / number, previous worker, first experience entry (title, company, location, current, start/end month/year, description), first education entry (school, degree, field, GPA), LinkedIn/website, work auth, sponsorship, relocate, notice period, expected salary, how did you hear. Per-tenant overrides via `TENANT_OVERRIDES` |

See `docs/ADDING_AN_ADAPTER.md` for the step-by-step.

---

## Testing

```bash
npm test
```

- `tests/linkedin.parse.test.ts`: card discovery, nested reshare exclusion, author/text/email/link/timestamp parsing, URN reading.
- `tests/linkedin.structure.test.ts`: class-less markup: three posts found among comments and a people suggestion, person and company authors, approximate dates, URN from a permalink, stable text ids, span "…more" clicks, Diagnose masking.
- `tests/linkedin.sample.test.ts`: full page capture with scripts disabled and the id scan.
- `tests/server.test.ts`: real HTTP round trip for collections and the page samples API, including path-traversal rejection.
- `tests/autofill.engine.test.ts`: fills text, select, radio, checkbox on a jsdom form; skip reasons; unmatched; unknown fields; overwrite mode; adapter host detection; unique spec keys.
- `tests/utils.test.ts`: email extraction and de-obfuscation, CSV quoting, keyword matching, doubled-label collapse, post merging.

The LinkedIn fixture is **synthetic**, built from `selectors.ts`. It proves `parse.ts` works against the selectors, not that the selectors match LinkedIn today. A LinkedIn redesign will not fail tests; it shows up as zero posts captured.

---

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Scaffold, typed messages, storage layer, profile schema and import | done |
| 1a | LinkedIn extractor, keyword filters, review UI, export | built, unverified live |
| 1b | Autofill engine, Greenhouse and Lever adapters | built, unverified live |
| 1c | Workday adapter (multi-step, comboboxes, tenant overrides) | built, unverified live; first entry only |
| 1d | Application log, fill reports, tests, docs | done |
| 2 | Remote backend (Express + Mongo or keep SQLite), auth, sync. `ApiRepository` already speaks the route shape; point it at the remote URL and add auth headers in `src/shared/storage/index.ts` | not started |
| 3 | AI: semantic field matching, post ranking and summaries, outreach drafts, profile extraction from the handoff | hooks only |

---

## AI extension points

Documented in `docs/AI_EXTENSION_POINTS.md`. In short:

1. `src/content/autofill/ai/semanticMatch.ts`: unknown fields + profile -> proposed mappings (stub exists, wired into the report).
2. Post ranking and one-line summaries on `ExtractedPost` (after `applyKeywords` in `src/shared/posts.ts`).
3. `draftOutreach(post, profile)` behind a button on `PostCard`.
4. One-off profile extraction from the prose handoff into `profile.json`.
5. Adapter generation from a fill report's unknown fields.

Call models from the Phase 2 backend, never from the extension with a raw API key.

---

## Known limits and caveats

- **Scraping LinkedIn is against its user agreement.** Keep it manual, slow (default 1.5 s per scroll), and on your own account. Do not automate beyond a button press.
- **LinkedIn markup drifts.** All selectors are in `src/content/linkedin/selectors.ts` as ordered fallback lists. Fix there only.
- **ATS adapters are unverified.** They were written from each platform's known field ids and labels. The fill report shows exactly which specs missed; tune the adapter file.
- **Workday** fills only the first education and experience entry (Workday repeats automation ids per entry). Country and phone-code prompts are long lists; if the prefix match fails, add a tenant override.
- **Pages loaded before the extension** do not have the content script. Reload the tab; the panel says so.
- **Extraction runs only while the tab is visible and the loop is active.** Switching tabs mid-run is fine; closing the tab ends it.
- **Most content-search posts have no post link in the page.** LinkedIn's class-less markup carries no post URN for ordinary posts (the 2026-11-13 run found one only on group posts). Those posts get a `text:<hash>` id, a link to the author's activity page instead of the post, and a `postedAt` estimated from "5h"-style labels (`postedAtApprox`). A page sample may show where the real link lives.
- **No icons** are bundled yet; Chrome shows a default.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Red banner "Storage server not reachable" | Run `npm run server` in the project folder and keep that terminal open. Or switch Settings > Storage to browser mode |
| "The page has not loaded the extension script" | Reload the LinkedIn/ATS tab after installing or rebuilding |
| Extract captures 0 posts | Press **Diagnose page**, paste the report to the agent. Also open DevTools on the LinkedIn tab, filter console by `[JobHunt]` |
| Posts captured but text is short | "...more" button selector changed; see `SEL.seeMoreButtons` and the text-pattern fallback in `expand.ts` |
| Author missing | `SEL.authorName` / `SEL.authorLink` |
| Fill reports "dropdown did not open" | The combobox is not a button/input the setter recognises; force `kind: 'combobox'` or inspect option markup (`optionSelector` in `setters.ts`) |
| Fill reports "no option matching" | Change `match` to `includes` or adjust the profile value |
| Side panel blank | Check `chrome://extensions` > extension card > Errors; rebuild |
| Settings or posts vanished | Profile and settings live in `chrome.storage.local`, which is per Chrome profile and cleared when the extension is removed. Posts in server mode survive in `server/data/jobhunt.sqlite`; in browser mode they are cleared too. Export regularly |

---

## Rules for making changes

These apply to **every agent and every person** who edits this repository, including AI coding agents (Claude Code, Codex, Cursor, Copilot) and anyone opening a pull request.

1. **Update this README in the same change.** If you add, remove, or change a feature, setting, message, storage key, file, script, adapter, host, or limitation, edit the matching section here. Add a line to the [Change log](#change-log) with the date, what changed, and who or what made the change (person or agent name). A change without a README update is incomplete.
2. **Keep `docs/` in sync** when the change touches architecture (`ARCHITECTURE.md`), adapters (`ADDING_AN_ADAPTER.md`), or AI hooks (`AI_EXTENSION_POINTS.md`).
3. **Never commit personal data.** `profile/profile.json` stays git-ignored. Do not paste real names, phone numbers, emails, or salary figures into tests, fixtures, docs, or the example profile.
4. **Respect the layer rules.** Content scripts never touch storage. Adapters never mutate the DOM. All LinkedIn selectors go in `selectors.ts`. New ATS hosts go in `ATS_HOSTS` in `manifest.config.ts`. New messages go in `MessageMap`.
5. **Run before finishing:** `npm run typecheck`, `npm test`, `npm run build`. All three must pass. Report the results honestly; if something fails, say so.
6. **Add or update tests** for parsers, setters, engine behaviour, and utilities. If you change the LinkedIn selectors, update `tests/fixtures/linkedin-post.ts` to match.
7. **Do not widen scope silently.** Do what was asked; note anything else you noticed as a suggestion, not as a change.
8. **Do not commit or push unless asked.** Leave changes in the working tree and describe them.
9. **Prefer small, readable code with comments that explain why.** This project is also a learning codebase.
10. **When a live site breaks the extension** (LinkedIn redesign, ATS change), fix the selector or adapter file, record the date and what changed in the change log, and update the Status table.

---

## Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-11-12 | Phase 1 built: scaffold (Vite 7, CRXJS 2, TS, React 19, Zod 4), typed message bus, local storage repositories, profile schema + import UI, LinkedIn extractor with full post capture, keyword tagging and filters, review/notes/status, CSV/JSON/text export, autofill engine with Greenhouse/Lever/Workday adapters, fill reports, application log, 20 unit tests, docs. Not yet verified on live sites. | Claude Fable 5.1 (Claude Code), requested by Ayush |
| 2026-11-12 | README rewritten as the full project reference; added rules for agents and contributors; added CLAUDE.md. | Claude Fable 5.1 (Claude Code), requested by Ayush |
| 2026-11-12 | Storage moved out of the browser: zero-dependency local server (`server/`, Node `node:sqlite`, `npm run server`) with SQLite file and SQL views; `ApiRepository` implemented; `SwitchingRepository` routes by Settings > Storage (default server); `DATA_CHANGED` message; server status banner and extract guard. Added **Diagnose page** (`LINKEDIN_DIAGNOSE`) and parser fallbacks (URN carriers, longest text block, first profile link) because the first live run captured nothing. Added `docs/LIVE_TEST.md` for human/agent testers. Tests: 25. | Claude Fable 5.1 (Claude Code), requested by Ayush |
| 2026-11-12 | Added **Save page sample** (`LINKEDIN_SAMPLE`, `src/content/linkedin/sample.ts`): downloads sanitized page HTML plus a scan of every post-id location, for fixing extraction against LinkedIn's new class-less markup. LIVE_TEST.md section 2b describes how to capture samples. Tests: 26. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | LinkedIn extraction: structural fallback for the class-less markup (`structure.ts`, `STRUCT` patterns): list-based card detection, author/headline/time/body without classes, URN from any attribute or permalink, else `text:<hash>` id with `urlKind` and approximate `postedAt`; span/role=button "…more" toggles. Diagnose: strategy, id-attribute and inventory sections, masked parsed fields, fixed attribute counts. Page samples now capture the full page and are saved by the server (`server/samples.mjs`, `/samples` routes, browser index) instead of downloaded. Tests: 34. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | Checked the first live extraction (37 posts in SQLite) and fixed what it showed: video posts took the video.js control bar (`dir="ltr"`, "Current Time 0:00 / Duration…") as the body, which also split one post into two ids, so the player is now excluded (`MEDIA_PLAYER` in `selectors.ts`); post URNs are read from URL-encoded attributes (group links); `/safety/go` links are unwrapped (`REDIRECT_PATHS`); group/services links and auto-linked words (B.Tech, Node.js) are dropped; `urnToDate` shifted by 23 bits instead of 22, which dated every real URN to 1998 and left `postedAt` empty. Tests: 38. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | Second live run (01:06 IST) re-saved 21 of the 37 posts under the same ids (ids stable across runs) with the new build, but old wrapped links stayed because `mergePost` unioned links. `mergePost` now takes links from the parse with the most text and unions only for shorter parses. Tests: 39. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | Posts now record `lastSeenAt` and `sourceUrls[]` (every search that showed the post; `capturedAt`/`sourceUrl` stay the first). CSV adds `urlKind`, `postedAtApprox`, `lastSeenAt`, `sourceUrls`; "Copy all details" adds capture/last-seen time and searches; SQL `posts` view adds `url_kind`, `posted_at_approx`, `posted_label`, `captured_at`, `last_seen_at`, `source_urls` and is recreated on server start. Scrolling: last post scrolled into view (inner scroll containers), "Show more results" also found by text/aria-label (`SEL.loadMoreTextPattern`), growth measured on `<main>` too. Tests: 42. | Claude Opus 5.5 (Claude Code), requested by Ayush |
