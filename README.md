# Job Hunt Assistant (Chrome extension, Manifest V3)

A modular Chrome extension that streamlines job hunting. Phase 1 (this repo, extension only) ships three features in one side panel: LinkedIn posts, WhatsApp group posts, ATS autofill. Later phases add a backend and AI.

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
13. [WhatsApp extraction internals](#whatsapp-extraction-internals)
14. [Autofill internals](#autofill-internals)
15. [Testing](#testing)
16. [Roadmap](#roadmap)
17. [AI extension points](#ai-extension-points)
18. [Known limits and caveats](#known-limits-and-caveats)
19. [Troubleshooting](#troubleshooting)
20. [Rules for making changes](#rules-for-making-changes)
21. [Change log](#change-log)

---

## Features

### A. LinkedIn post and contact extractor

Run a LinkedIn search such as `"hiring" AND "2+ years" AND "node.js" NOT "open to work"`, open the side panel, enter how many posts you want (e.g. 200) and click **Extract**, or click **More** to capture the next 20. The extension:

- scrolls the page at a human pace (a random 3-7 s pause between scrolls, configurable), clicks every "...more" so truncated posts are fully expanded, and stores each batch as soon as it is parsed, so a stopped run keeps everything captured so far
- captures **every detail of every post**, with or without an email (many posts have only an apply link):
  - author name, headline, profile URL
  - post URL and the exact timestamp (decoded from the activity id, more precise than LinkedIn's "3d")
  - the full post text with line breaks preserved
  - every link in the post or attached article (LinkedIn redirect wrappers `/redir/redirect` and `/safety/go` unwrapped, tracking params removed, LinkedIn navigation and words LinkedIn auto-links such as "B.Tech" or "Node.js" dropped)
  - every email address, including obfuscated forms like `name [at] company [dot] com` and `mailto:` links
- tags each post with the **include keywords** it matches and the **exclude keywords** it matches (see Settings)
- stores everything locally and deduplicates by post id, so re-running on the same search adds only new posts and never overwrites your status or notes

On the **Posts** tab you can then:

- filter by keyword chip, contact (any / has email or link / has email / has link / no email, no link), status (new / reviewed / contacted / ignored), **search** (every LinkedIn search you extracted from, with its post count and an **open search** link to run it again), hide excluded, free-text search
- click an email to copy it, or press **Email** to open a mailto draft
- **Copy all details** of a post (author, profile, post URL, date, emails, links, keywords, status, notes, full text) for pasting into an email or notes
- set a status and write notes per post (who you contacted, what they said)
- export the filtered set as **CSV**, **JSON**, or plain **text**, to clipboard or as a download
- delete the shown posts or clear everything

### B. WhatsApp group job posts

Open WhatsApp Web, click a job group, and press **Extract** on the **WhatsApp** tab. Recruiter groups are mostly noise and most posts do not fit, so the extension reads a lot and keeps little:

- reads the open chat from the newest message backwards, scrolling up for older messages at a reading pace (random 1.5-4 s pause), until it has the number of **job posts** you asked for (default 100), reaches messages older than N days (default 30), or WhatsApp has no older messages
- keeps only messages that look like job posts (hiring words, experience, location, CTC, an email or a phone number); chit-chat, "X added Y" notices, your own messages and images without a caption are read but not stored
- clicks "Read more" so long posts are captured in full, with emoji and line breaks
- captures per post: text, emails, **phone numbers** (normalised to +91..., with a wa.me chat link), links, **experience asked** ("2 yrs", "6-7 yrs", "8+ yrs"), group, sender (name and number where WhatsApp shows it) and message time
- stores the same text forwarded into several groups **once**, listing every group, sender and time it was seen in
- stores into its own `whatsappPosts` collection (SQL view `whatsapp_posts`), never mixed with LinkedIn posts

The WhatsApp tab filters by contact (email or phone / email / phone / link / none), group, **my years** (hides posts whose minimum experience is above yours; posts that state none stay), keyword chip, status and text, and exports CSV/JSON/text like the Posts tab. It only reads and scrolls; it never types or sends anything.

### C. ATS application autofill

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
| Build, type check, unit tests | Passing (`npm run build`, `npm test`, 77 tests incl. server round trip) |
| Local SQLite server | Built and tested (unit + smoke). `npm run server` |
| Loaded in Chrome | Loaded by Ayush; first extraction attempt captured nothing (cause not yet known, Diagnose page added to find out) |
| LinkedIn extraction on a live page | **Working on content search, with gaps.** First live run of the structural fallback (2026-11-13) stored 37 posts: author, profile, text, emails and approximate time correct on 34. Fixed after that run: video posts stored the video player's control text as the post body, `/safety/go` links were not unwrapped. Still open: no post link in the page for most posts (see Known limits). **Extract N / More worked live** on 2026-11-13 (about 03:30-04:50 IST): the store grew from 37 to 239 posts across two searches, with `lastSeenAt` and `sourceUrls` filled. Not checked from that run: the random pause and "Show more results" handling. Not yet tried on the feed. No page sample saved yet |
| WhatsApp group extraction | **Built 2026-11-13, not yet tried on a live page.** Written from WhatsApp Web's known markup (`data-id`, `data-pre-plain-text`, `span.selectable-text`); 20 unit tests on synthetic markup. First live run: `docs/LIVE_TEST.md` 2c, with Diagnose chat |
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
4. Click the toolbar icon on any tab. The side panel opens. It switches to the Posts tab automatically on LinkedIn, to WhatsApp on web.whatsapp.com, and to Autofill on a supported ATS host.

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
2. Side panel > **Posts**. Type the number of posts to capture (default 200, remembered) and press **Extract**: it starts from the top of the results, scrolls with a random pause between scrolls, and stores every batch as it goes. Progress shows "Captured N of M. Next scroll in 4.2 s". **Stop** at any time; everything captured so far is already stored.
3. Press **More (+20)** to capture the next 20 posts not yet captured on this page. It continues from where the last Extract or More stopped (the page remembers what it sent until its URL changes or the tab reloads), so pressing More repeatedly walks down the results. Pressing **Extract** again starts from the top.
4. A run ends when it has its count, nothing new loads after three scrolls, or you stop it. The final status line says which.
5. Review on the Posts tab. Posts matching an exclude keyword are hidden by default (untick "hide excluded" to see them). Links are shown open on each card; the contact filter finds posts with a link but no email. The search menu (shown once a search is stored) narrows the list to posts one search found; **open search** opens that search on LinkedIn again.

### WhatsApp

1. Open `https://web.whatsapp.com/`, log in, and **reload the tab** once after installing or reloading the extension.
2. Click a job group. Side panel > **WhatsApp** shows "Chat: <group> · N messages loaded".
3. Set **job posts** (how many to keep, default 100) and **back N days** (default 30, 0 = no limit), press **Extract**. The chat scrolls up by itself; progress shows "Captured 12 of 100 job posts, 340 messages read, back to 02/11/2026". **Stop** at any time; everything captured so far is stored.
4. **More (+50)** continues further back in the same chat. Opening another group and pressing Extract or More starts that group from its newest message.
5. Repeat for each group. A post forwarded into several groups shows once, with "also in N other groups".
6. Review on the WhatsApp tab. Type your years of experience in **my years** to hide posts that ask for more. Click a phone's **chat** link to open a WhatsApp chat with the recruiter, or **Email** for a mailto draft.

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
| Store only posts that hit an include keyword | off | When on, the background drops non-matching new LinkedIn and WhatsApp posts instead of storing them |
| Posts to capture per Extract | 200 | Also the number box on the Posts tab, which saves back here |
| Posts to capture per More press | 20 | Next N posts not yet captured on the page |
| Pause between scrolls, at least / at most (s) | 3 / 7 | A random time in this range before each scroll, so the pace looks like reading. Raise it for long runs |
| Wait for new posts after each scroll, at most (ms) | 1500 | How long to wait for LinkedIn to render more posts after a scroll |
| Scroll to load more | on | Off = capture only what is already on screen |
| Click "...more" | on | Expand truncated posts before capture |
| WhatsApp: job posts per Extract | 100 | Also the number box on the WhatsApp tab. Counts job posts kept, not messages read |
| WhatsApp: job posts per More press | 50 | Next N job posts further back in the open chat |
| WhatsApp: stop at messages older than (days) | 30 | Also the "back N days" box on the WhatsApp tab. 0 = read back as far as WhatsApp Web has |
| WhatsApp: pause between scrolls, at least / at most (s) | 1.5 / 4 | Random pause before each scroll up |
| WhatsApp: wait for older messages (ms) | 3000 | How long to wait for WhatsApp to load older messages after a scroll up |
| WhatsApp: store only job-like messages | on | Off = store every text message (greetings too) |
| WhatsApp: scroll up / click "Read more" | on / on | Off = only what is loaded / truncated text |
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
SELECT keywords, posts, first_seen_at, last_seen_at, url FROM searches ORDER BY last_seen_at DESC;
SELECT company, status, url FROM applications;
SELECT chat, sender, sender_phone, posted_at, exp_min, exp_max, emails, phones, times_seen, chats, substr(text, 1, 80) FROM whatsapp_posts ORDER BY posted_at DESC;
```

Schema: one `documents(collection, id, data JSON, created_at, updated_at)` table plus the `posts`, `searches`, `whatsapp_posts` and `applications` views (`server/store.mjs`). The `posts`, `searches` and `whatsapp_posts` views are dropped and recreated on every server start, so new columns appear after a restart (restart the server once to get `whatsapp_posts`). Routes are listed in `server/app.mjs`: `GET/PUT/DELETE /api/:collection/:id`, `GET/DELETE /api/:collection`, `POST /api/:collection/bulk`, `POST /api/:collection/bulk-delete`, `GET /health`. Collections: `posts` (LinkedIn), `searches` (LinkedIn search/feed URLs, one row each), `whatsappPosts` (WhatsApp groups, kept apart from LinkedIn), `applications`, `fillReports`. The server binds to 127.0.0.1 only.

**Page samples** are files, not database rows: `server/data/samples/<id>.html` (full page, scripts disabled) and `<id>.json` (url, time, note, id scan, inventories). Override the folder with `JOBHUNT_SAMPLES`. Routes: `GET /samples` (browser index), `GET /samples.json`, `POST /samples` (body `{ meta, html }`), `GET /samples/:id.html` (served with a Content-Security-Policy that blocks all scripts), `GET /samples/:id.json`, `DELETE /samples/:id` (`server/samples.mjs`).

**Browser mode** keys: `collection:posts`, `collection:searches`, `collection:whatsappPosts`, `collection:applications`, `collection:fillReports` (each a `Record<id, item>`), `value:profile`, `value:settings`.

Types are in `src/shared/types.ts`. `ExtractedPost` fields: id (`activity:<n>`, `ugcPost:<n>`, or `text:<hash>` when the page shows no post id), url, urlKind (`post`, `author-activity`, `search`), postedAtApprox, author {name, headline, profileUrl}, text, emails[], links[], postedAt (ISO), postedAtLabel ("3d"), capturedAt (first time an extraction saw it), lastSeenAt (latest time), searchIds[] (every search or feed page that showed it, oldest first, as ids in `searches`; [0] is where it was first captured), matchedKeywords[], excludedBy[], status, notes. Posts stored before 2026-11-13 have no lastSeenAt until seen again (exports and the `posts` view fall back to capturedAt).

**Searches.** A search URL is long and the same for every post the search finds (on 2026-11-13, 239 posts repeated 2 URLs 479 times, a fifth of the database), so each search or feed page is stored once in the `searches` collection as a `SearchPage`: id (`search:<hash>` of the URL), url (with per-visit params such as `sid` and `origin` removed and the rest sorted, so the same search always gets the same id; opening it runs the search again), keywords (the decoded query, missing on the feed), firstSeenAt, lastSeenAt. The content script sends the page URL with each batch (`POSTS_CAPTURED.pageUrl`) and posts carry only `searchIds`. Posts stored earlier hold `sourceUrl`/`sourceUrls` strings instead; the first capture after this change moves every such URL into `searches` and drops the strings (all stored posts in one go). Until then, exports, the search filter and the `posts` view read the old fields. Code: `src/shared/searches.ts`.

`WhatsAppPost` fields: id (`wa:<hash>` of the first 300 letters/digits of the text, so the same text in several groups is one row), text, emails[], phones[] (`+917087706624` form), links[], experience {min, max?} (missing when the post states none; several roles give the lowest min), chat, sender {name, phone?} and postedAt (all three from the earliest sighting), sightings[] ({messageId (WhatsApp's data-id), chat, chatId, sender, senderPhone?, postedAt?, forwarded?}, earliest first, at most 50), capturedAt, lastSeenAt, matchedKeywords[], excludedBy[], status, notes. Keyword tags use the same include/exclude lists as LinkedIn, matched against the text.

**Re-running extraction** on the same or a different search never duplicates a post that keeps its id: it updates text (longest wins), links, lastSeenAt and searchIds, and keeps status, notes, capturedAt and searchIds[0]. CSV/JSON exports contain every field above with the search URLs written out again (`sourceUrl`, `sourceUrls` resolved from `searchIds`), which is what another tool or AI needs to review posts. `GET /api/posts` returns posts with `searchIds`; `GET /api/searches` returns the URLs, and the `posts` SQL view joins them (`source_url`, `source_urls`, `search_ids`).

The storage API is the `Repository<T>` interface (`get/list/put/putMany/remove/removeMany/clear/subscribe`) and `ValueStore<T>`. `LocalRepository` implements it over chrome.storage, `ApiRepository` over the server routes, and `SwitchingRepository` (in `src/shared/storage/index.ts`) routes each call to one of them based on the current settings. Call sites only ever see `postsRepo`, `searchesRepo`, `whatsappRepo`, `applicationsRepo`, `fillReportsRepo`. Phase 2 points `ApiRepository` at a remote backend with the same routes plus auth.

---

## Architecture

Three contexts, strict separation:

| Context | Runs in | Touches storage | Talks to |
| --- | --- | --- | --- |
| LinkedIn content script | linkedin.com tab | no | background (`POSTS_CAPTURED`), side panel (`LINKEDIN_EXTRACT_PROGRESS`) |
| WhatsApp content script | web.whatsapp.com tab | no | background (`WHATSAPP_CAPTURED`), side panel (`WHATSAPP_EXTRACT_PROGRESS`); reads and scrolls only |
| Autofill content script | ATS tab | no | answers the side panel (`AUTOFILL_DETECT`, `AUTOFILL_RUN`) |
| Background service worker | extension | yes | merges captured LinkedIn and WhatsApp posts into storage |
| Side panel (React) | extension page | yes | sends commands to content scripts via `chrome.tabs.sendMessage` |
| Local storage server | Node process on the laptop | owns the SQLite file | answers HTTP from background and panel (server mode) |

Design rules:

- Content scripts never touch storage, so the backend can change without touching page code.
- The background owns every write that can happen while the panel is closed.
- The panel subscribes to storage changes, so the list updates live while extraction streams in.
- Every third-party selector lives in exactly one file per site (`src/content/linkedin/selectors.ts`, `src/content/whatsapp/selectors.ts`).
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
│   ├── store.mjs                 SQLite documents table + posts/searches/whatsapp_posts/applications views
│   ├── samples.mjs               page sample files + browser index
│   └── data/                     git-ignored: jobhunt.sqlite, samples/
├── src/
│   ├── shared/
│   │   ├── types.ts              ExtractedPost, WhatsAppPost, Application, FillReport, Settings, DEFAULT_SETTINGS
│   │   ├── messages.ts           MessageMap, sendToTab, sendToRuntime, onMessage
│   │   ├── posts.ts              mergePost, applyKeywords, mergeCapturedPosts, rematchAllPosts (LinkedIn)
│   │   ├── searches.ts           LinkedIn search URLs: normalizeSearchUrl, searchIdOf, searchBook, legacy sourceUrl migration (pure)
│   │   ├── whatsapp.ts           mergeWhatsAppPost (sightings), mergeCapturedWhatsApp, rematchAllWhatsApp
│   │   ├── storage/              Repository.ts, LocalRepository.ts, ApiRepository.ts (HTTP), index.ts (SwitchingRepository)
│   │   └── utils/                email.ts, phone.ts, jobtext.ts (isJobPost, parseExperience), hash.ts, csv.ts, dom.ts (incl. pickPause), keywords.ts, log.ts
│   ├── background/index.ts       service worker: router, side panel behaviour
│   ├── content/
│   │   ├── linkedin/
│   │   │   ├── selectors.ts      EVERY LinkedIn selector, incl. fallback lists
│   │   │   ├── expand.ts         click "...more", scroll, "Show more results"
│   │   │   ├── parse.ts          pure DOM -> ExtractedPost (unit-tested), with fallbacks
│   │   │   ├── diagnose.ts       page structure report for fixing selectors (no text)
│   │   │   ├── structure.ts      class-free card/author/text/time detection for the newer markup
│   │   │   ├── sample.ts         full page sample (HTML + id scan) sent to the server
│   │   │   ├── extract.ts        extraction loop: Extract / More, page session, random pause (unit-tested)
│   │   │   └── index.ts          entry: messages, wires extract.ts to chrome messaging
│   │   ├── whatsapp/
│   │   │   ├── selectors.ts      EVERY WhatsApp Web hook (data-id, data-pre-plain-text, body spans, Read more)
│   │   │   ├── parse.ts          pure DOM -> WhatsAppPost: data-id, stamp, body text with emoji, contacts, content id
│   │   │   ├── page.ts           the only page actions: click "Read more", scroll the message list up
│   │   │   ├── extract.ts        extraction loop: Extract / More, chat session, age limit (unit-tested)
│   │   │   ├── diagnose.ts       chat structure report, no text/names/numbers
│   │   │   └── index.ts          entry: messages, wires extract.ts to chrome messaging
│   │   └── autofill/
│   │       ├── adapters/         Adapter.ts (interface + locators), greenhouse.ts, lever.ts, workday.ts, index.ts (registry)
│   │       ├── setters.ts        text / select / checkbox / radio / combobox
│   │       ├── engine.ts         runFill, collectUnknownFields, labelFor
│   │       ├── ai/semanticMatch.ts   AI hook (returns [])
│   │       └── index.ts          entry: detect + run messages
│   └── sidepanel/
│       ├── index.html, main.tsx, App.tsx, styles.css
│       ├── lib/                  hooks.ts, export.ts (CSV/JSON/text/clipboard), tabs.ts, server.ts (status), samples.ts (upload)
│       ├── components/           PostCard.tsx (LinkedIn), WhatsAppCard.tsx
│       └── pages/                PostsPage, WhatsAppPage, AutofillPage, ProfilePage, LogPage, SettingsPage
├── tests/
│   ├── fixtures/linkedin-post.ts synthetic LinkedIn markup built from selectors.ts
│   ├── fixtures/whatsapp-chat.ts synthetic WhatsApp Web chat built from whatsapp/selectors.ts (fake names and numbers)
│   ├── whatsapp.test.ts          stamps, data-ids, parsing, Read more, job/experience/phone heuristics, merge, loop, diagnose privacy
│   ├── linkedin.parse.test.ts
│   ├── linkedin.structure.test.ts class-less markup fixture: cards, author, text, ids, expand, diagnose privacy
│   ├── linkedin.sample.test.ts   full page capture, scripts disabled, id scan
│   ├── autofill.engine.test.ts
│   ├── searches.test.ts          search URL ids, searches table, legacy migration, mergeCapturedPosts
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
| `LINKEDIN_EXTRACT_START` | panel -> LinkedIn content | start with `ExtractOptions` and `mode` (`fresh` = Extract, `more` = More) |
| `LINKEDIN_EXTRACT_STOP` | panel -> LinkedIn content | stop after the current round |
| `LINKEDIN_STATUS` | panel -> LinkedIn content | running flag + post count on page |
| `LINKEDIN_DIAGNOSE` | panel -> LinkedIn content | selector hit counts + structural outline of the first cards (no text), for fixing selectors |
| `LINKEDIN_SAMPLE` | panel -> LinkedIn content | full page HTML (scripts disabled) plus every post-id location; the panel POSTs it to the server's `/samples`, or downloads it if the server is down |
| `DATA_CHANGED` | any writer -> everyone | a collection changed; panel refetches (needed in server mode, which cannot push) |
| `LINKEDIN_EXTRACT_PROGRESS` | content -> panel | progress broadcast |
| `POSTS_CAPTURED` | content -> background | batch of parsed posts plus `pageUrl` (the search/feed page, stored once in `searches`); returns stored/dropped counts |
| `WHATSAPP_EXTRACT_START` | panel -> WhatsApp content | start with `WhatsAppExtractOptions` (`settings.whatsapp`) and `mode` (`fresh` = Extract, `more` = More) |
| `WHATSAPP_EXTRACT_STOP` | panel -> WhatsApp content | stop after the current round |
| `WHATSAPP_STATUS` | panel -> WhatsApp content | running flag, open chat name, messages loaded (polled every 4 s; WhatsApp Web has one URL for all chats) |
| `WHATSAPP_DIAGNOSE` | panel -> WhatsApp content | counts, masked data-id/stamp shapes, scroller, one message's tag outline; no text, names or numbers |
| `WHATSAPP_EXTRACT_PROGRESS` | WhatsApp content -> panel | progress broadcast |
| `WHATSAPP_CAPTURED` | WhatsApp content -> background | batch of job posts; merged into `whatsappPosts`, returns stored/dropped counts |
| `AUTOFILL_DETECT` | panel -> autofill content | adapter name + visible known fields |
| `AUTOFILL_RUN` | panel -> autofill content | profile + options; returns `FillReport` |

To add a message: add a key to `MessageMap`, a handler in the receiving context, and a sender call. Nothing else.

---

## LinkedIn extraction internals

1. The panel reads `settings.extract` (with the Posts-tab number as `maxPosts`) and sends `LINKEDIN_EXTRACT_START` with `mode` `fresh` (Extract) or `more` (More).
2. The content script runs `runExtraction()` (`extract.ts`). A page session (`id -> text length sent`) lives in the content script until the URL changes or the tab reloads. `fresh` clears it and counts up to `maxPosts`; `more` keeps it and counts only posts not in it, up to `moreBatch`. Re-sent posts (text grew) never count. Each round: `expandAll()` clicks every "...more" button (by class, by aria-label, or by button text as a fallback), `findPostCards()` returns top-level cards (nested reshares excluded), `parsePostCard()` builds an `ExtractedPost`.
3. A post is re-sent when its text grew since the last send (it was expanded). The background `mergePost` keeps the longest text, unions emails, takes the links from the parse with the longest text (so re-extracting after a parser fix replaces wrong links; a shorter parse only adds links), keeps the first captured status and notes, unions `searchIds`, and re-applies keyword tags. Before the posts, the background writes the batch's `pageUrl` to `searches` (new page, or a later lastSeenAt). Re-extracting never removes a stored post: a post whose id changes (its text changed) is stored as a new row next to the old one.
4. `scrollForMore()` scrolls the window to the bottom and scrolls the last post into view (which also scrolls an inner results container, if LinkedIn uses one), clicks any "Show more results" button (known selectors, else a button in `<main>` whose text or aria-label matches `SEL.loadMoreTextPattern`, e.g. "Show more results", "Load more posts"), and waits up to `scrollDelayMs` for growth. Growth = page height, `<main>` height or `<main>` link count went up. Before each scroll the loop pauses a random `pauseMinMs`..`pauseMaxMs` (default 3-7 s), checking Stop every 250 ms.
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

## WhatsApp extraction internals

WhatsApp Web hashes its class names and dropped most `data-testid`s in 2023, so `src/content/whatsapp/selectors.ts` (`W`) uses the hooks WhatsApp's own copy/paste keeps stable:

| Hook | Used for |
| --- | --- |
| `#main`, `#main header` | the open chat and its name (first header text that is not the member list, "online" or "typing") |
| `data-id="false_<chat>@g.us_<msgId>_<sender>@c.us"` | one element per message (outermost carrier); `true_` = sent by you, skipped; chat id keys the session; `<sender>@c.us` gives the sender's number, `@lid` hides it |
| `data-pre-plain-text="[2:48 pm, 13/11/2026] Sender: "` | message time and sender. Day/month order: a first part above 12 means day first, a second part above 12 month first, else the browser locale (US = month first) |
| `span.selectable-text` (fallbacks in `W.body`) | the body; the longest one not inside a quoted reply |
| `<img alt="🔥">` | emoji, read as their alt text |
| text "Read more" on `[role=button]` / `.read-more-button` | clicked once, innermost element first |
| `[data-icon*="forward"]` | the sighting's `forwarded` flag |

The loop (`extract.ts`, `runWhatsAppExtraction`):

1. `expandReadMore()` clicks every new "Read more" and returns the expanded messages' data-ids, so they are re-read. Clicked toggles are kept in a WeakSet; nothing is written to WhatsApp's DOM.
2. `findMessageElements()` lists messages oldest first; the loop reads them **newest first**. Each message is parsed once per run. `parseMessage()` returns null for your own messages, system notices (no body) and media without a caption.
3. A message older than `maxAgeDays` is skipped and ends the run after this round. `isJobPost()` (40+ characters and three of: hiring/recruit, job/opening/vacancy/position, role, experience/years, CTC/LPA/salary, apply/CV/resume/JD, walk-in/interview/notice period, location/remote/WFH/WFO/hybrid, full-time/contract/internship/fresher, developer/engineer/architect/..., skills/requirements/responsibilities, an email, a phone) decides what is kept. Only kept posts count towards the run's number.
4. The chat session (`data-id -> text length sent`) lives in the content script. `fresh` clears it; `more` keeps it; opening another chat resets it. A post already sent is re-sent only if "Read more" made it longer.
5. Each batch goes to the background (`WHATSAPP_CAPTURED`), which merges by content id: same text = same row, one more sighting.
6. `loadOlder()` clicks any "older messages" button in the chat, nudges the message list (first scrollable ancestor of a message, else `W.scrollerFallbacks`) down then to the top, and waits up to `scrollDelayMs` for the oldest loaded message to change. Three scrolls with no change end the run.

**Experience** (`parseExperience` in `src/shared/utils/jobtext.ts`): the number(s) right after "Experience"/"Exp"/"YOE" ("Experience: 8+", "Exp - 2-4"), plus "N years", "N+ yrs", "N to M years" anywhere. Months ("12 months"), versions ("Node.js 18") and CTC figures are ignored. Several roles give the lowest minimum, so the **my years** filter errs towards showing a post. "Fresher" alone = 0.

**Phones** (`extractPhones` in `src/shared/utils/phone.ts`): runs of digits with spaces/dashes/brackets, not inside links or emails; +CC numbers of 10-15 digits, Indian 10-digit mobiles (6-9 first), 0-prefixed 11-digit numbers, 91-prefixed 12-digit numbers. Dates, salaries and ids do not match.

**Diagnose chat** (WhatsApp tab) copies a JSON report: counts per hook, masked data-id and stamp shapes (`false_9@g.us_X_9@c.us`, `[9:99 pm, 99/99/9999] <sender>: `), which scroller was found, how many messages parsed / had a date / looked like job posts, and a tag/attribute outline of the newest incoming message. No message text, names or numbers. Paste it to whoever fixes `selectors.ts`; procedure in `docs/LIVE_TEST.md` 2c.

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
- `tests/whatsapp.test.ts`: data-id and stamp parsing (both date orders, am/pm, 2-digit years), chat name, message body with emoji/line breaks, quoted replies, Read more (expanded id is re-read, content id unchanged), own/system messages skipped, job-post/experience/phone heuristics, merging sightings across groups, the loop (newest first, More, age limit, chat switch, job filter off), loadOlder, and that Diagnose leaks no names, numbers or text.
- `tests/searches.test.ts`: search URL normalization (sid/origin dropped, encoding kept), stable ids, first/last seen, legacy `sourceUrl` migration, export URL resolution, and `mergeCapturedPosts` writing one search row for many posts (storage mocked in memory).
- `tests/server.test.ts`: real HTTP round trip for collections (including `whatsappPosts` and the `whatsapp_posts` view, `searches` and the URL columns of the `posts` view) and the page samples API, including path-traversal rejection.
- `tests/autofill.engine.test.ts`: fills text, select, radio, checkbox on a jsdom form; skip reasons; unmatched; unknown fields; overwrite mode; adapter host detection; unique spec keys.
- `tests/utils.test.ts`: email extraction and de-obfuscation, CSV quoting, keyword matching, doubled-label collapse, post merging.

The LinkedIn and WhatsApp fixtures are **synthetic**, built from each site's `selectors.ts`. It proves `parse.ts` works against the selectors, not that the selectors match LinkedIn today. A LinkedIn redesign will not fail tests; it shows up as zero posts captured.

---

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Scaffold, typed messages, storage layer, profile schema and import | done |
| 1a | LinkedIn extractor, keyword filters, review UI, export | built, unverified live |
| 1b | Autofill engine, Greenhouse and Lever adapters | built, unverified live |
| 1c | Workday adapter (multi-step, comboboxes, tenant overrides) | built, unverified live; first entry only |
| 1d | Application log, fill reports, tests, docs | done |
| 1e | WhatsApp group job posts (read-only extractor, own collection and tab, phone and experience parsing) | built, unverified live |
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
- **WhatsApp extraction is unverified live.** It was written from WhatsApp Web's known markup without a live page. If it captures nothing, use Diagnose chat (`docs/LIVE_TEST.md` 2c) and fix `src/content/whatsapp/selectors.ts`.
- **Automating WhatsApp Web is against WhatsApp's terms too.** The extension only reads and scrolls your own chats at a reading pace and never types or sends; keep runs manual, one button press at a time.
- **WhatsApp: image-only posts are skipped.** Many recruiters post a JD as an image or PDF; without a caption there is no text to keep (no OCR).
- **WhatsApp: history depth is what WhatsApp Web has.** Older messages may live only on the phone; WhatsApp then shows a button to fetch them. The loop clicks a button whose text mentions "older messages", but the phone must be online.
- **WhatsApp: senders behind LIDs** (`...@lid`, WhatsApp's phone-number privacy) have no number unless their name is one.
- **WhatsApp: the job filter is a heuristic.** A referral request with three job words passes; a terse post may not. Turn off "store only job-like messages" in Settings to keep everything.
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
| WhatsApp tab says the page has not loaded the extension script | Reload the WhatsApp Web tab after installing or reloading the extension |
| WhatsApp tab says "No chat open" while a chat is open, or Extract captures 0 | Press **Diagnose chat** and paste the report to the agent; `docs/LIVE_TEST.md` 2c |
| WhatsApp run stops early with "No older messages loaded" | WhatsApp Web has no older history loaded. Click WhatsApp's own "older messages" link in the chat if shown, then **More**; raise "wait for older messages" in Settings on a slow connection |
| WhatsApp posts dated wrong by days/months | The date order guess failed. Diagnose chat shows `dayFirst`; tell the agent your WhatsApp date format |
| WhatsApp tab: "storage server is an older version without WhatsApp posts" | The server was started before this feature. Stop it (Ctrl+C) and run `npm run server` again |
| `whatsapp_posts` view missing in the SQLite file | Restart `npm run server`; views are created on start |
| Settings or posts vanished | Profile and settings live in `chrome.storage.local`, which is per Chrome profile and cleared when the extension is removed. Posts in server mode survive in `server/data/jobhunt.sqlite`; in browser mode they are cleared too. Export regularly |

---

## Rules for making changes

These apply to **every agent and every person** who edits this repository, including AI coding agents (Claude Code, Codex, Cursor, Copilot) and anyone opening a pull request.

1. **Update this README in the same change.** If you add, remove, or change a feature, setting, message, storage key, file, script, adapter, host, or limitation, edit the matching section here. Add a line to the [Change log](#change-log) with the date, what changed, and who or what made the change (person or agent name). A change without a README update is incomplete.
2. **Keep `docs/` in sync** when the change touches architecture (`ARCHITECTURE.md`), adapters (`ADDING_AN_ADAPTER.md`), or AI hooks (`AI_EXTENSION_POINTS.md`).
3. **Never commit personal data.** `profile/profile.json` stays git-ignored. Do not paste real names, phone numbers, emails, or salary figures into tests, fixtures, docs, or the example profile.
4. **Respect the layer rules.** Content scripts never touch storage. Adapters never mutate the DOM. All LinkedIn selectors go in `src/content/linkedin/selectors.ts`, all WhatsApp selectors in `src/content/whatsapp/selectors.ts`. WhatsApp posts stay in their own `whatsappPosts` collection. New ATS hosts go in `ATS_HOSTS` in `manifest.config.ts`. New messages go in `MessageMap`.
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
| 2026-11-13 | Posts tab: number box + **Extract** (capture N from the top, saved to `settings.extract.maxPosts`) and **More (+20)** (next `moreBatch` posts not yet captured on the page); random pause between scrolls (`pauseMinMs`/`pauseMaxMs`, default 3-7 s) and new Settings fields; loop moved to `src/content/linkedin/extract.ts` (`runExtraction`, page session, `pickPause`); `LINKEDIN_EXTRACT_START` takes `mode`. Contact filter (any / email or link / email / link / neither) replaces "has email"; stored counts show posts with link and with neither; links shown open on cards. Tests: 46. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | **WhatsApp group job posts** (`src/content/whatsapp/`, new `web.whatsapp.com` host): read-only extractor that reads the open chat newest first, clicks "Read more", scrolls up with a random 1.5-4 s pause, keeps job-like messages (`isJobPost`), and stops at a count of job posts, an age limit (default 30 days) or the start of the loaded history. New `whatsappPosts` collection + `whatsapp_posts` SQL view, separate from LinkedIn `posts`; one row per text (`wa:<hash>`) with a sighting per group/sender/time. Phone extraction (`utils/phone.ts`, wa.me links) and experience parsing (`utils/jobtext.ts`) with a "my years" fit filter. New WhatsApp side-panel tab (Extract / More / Diagnose chat, filters by contact, group, years, keyword, status; CSV/JSON/text export), `settings.whatsapp`, messages `WHATSAPP_EXTRACT_START/STOP/STATUS/DIAGNOSE/EXTRACT_PROGRESS/CAPTURED`. `fnv1a` moved to `utils/hash.ts` and `pickPause` to `utils/dom.ts` (LinkedIn ids unchanged). Not yet tried on a live WhatsApp page. Also recorded: LinkedIn Extract/More worked live (37 -> 239 posts). Tests: 67. | Claude Opus 5.5 (Claude Code), requested by Ayush |
| 2026-11-13 | LinkedIn search URLs stored once: new `searches` collection (SQL view `searches`, browser key `collection:searches`, `SearchPage` type, `src/shared/searches.ts`); posts keep `searchIds[]` instead of `sourceUrl`/`sourceUrls`; `POSTS_CAPTURED` carries `pageUrl`; per-visit params (`sid`, `origin`, ...) removed so one search is one row. The first capture after the update migrates every stored post's URLs (dry run on a copy of the live DB: 239 posts, 2 searches, post JSON 597 KB -> 486 KB). CSV/JSON/text exports and the `posts` view resolve ids back to URLs. Posts tab: search filter with post counts and **open search** link. Coordination with the WhatsApp agent in `AGENTS_COORDINATION.md`. Tests: 77 (all agents). | Claude Opus 5.5 (Claude Code), requested by Ayush |
