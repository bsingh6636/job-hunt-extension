# Live test procedure

For a person or an agent (Codex, Claude in Chrome, etc.) testing the extension against real pages. Report results back by pasting the blocks marked **PASTE**.

## 0. Start the storage server

```bash
cd projects/job-hunt-extension
npm run server
```

Leave it running. It prints the SQLite path and the samples folder. Open `http://127.0.0.1:4777/health` in a tab; it must return `{"ok":true,...,"samples":{...}}`. If `samples` is missing, an old server is still running: stop it with Ctrl+C and start it again.

## 1. Build and load

```bash
npm run build
```

`chrome://extensions` > Developer mode > Load unpacked > `dist/`. If it was already loaded, press the reload icon on the card.

## 2. LinkedIn extraction

1. Open `https://www.linkedin.com/search/results/content/?keywords=%22hiring%22%20AND%20%22node.js%22` (any content search works).
2. **Reload the tab** after loading or reloading the extension.
3. Click the extension icon. Side panel opens on **Posts**.
4. Press **Diagnose page**. The report is copied to the clipboard and shown in the panel.
   **PASTE** the whole diagnose JSON.
5. Press **Extract posts from this tab**. Wait 20 seconds.
   **PASTE** the status line (e.g. "Captured 37 posts on page") and the "N stored" count. Let it run until it stops by itself and **PASTE** the final line ("No more posts loaded", "Reached limit of N posts", "Stopped" or an error). Note whether a "Show more results" button was visible at the bottom when it stopped.
6. Open DevTools (F12) on the LinkedIn tab, Console, filter `[JobHunt]`.
   **PASTE** any lines, especially errors.
7. Check `http://127.0.0.1:4777/api/posts` shows a JSON array.
   **PASTE** the first object (or "empty array").

If posts were captured, check one card in the panel: author name present? text full (not cut at "...more")? emails found where the post shows one? For a video post, is the text the caption and not "Current Time 0:00 / Duration…"? **PASTE** yes/no for each.

## 2b. Page samples (when extraction captures nothing or misses fields)

The Diagnose report only describes structure. When LinkedIn changes its markup, the fix needs the real HTML. **Save page sample** sends the full page to the local server, which saves it under `server/data/samples/` (git-ignored). Browse saved samples at `http://127.0.0.1:4777/samples`. Samples contain other people's public post text, so never commit or upload them.

1. On the search results tab, find the first three posts. For each, open its `...` menu > **Copy link to post**. In the side panel, Posts > **Page sample** > Notes, paste one line per post: `1 | <author name> | <first five words of the post> | <copied link>`.
2. Press **Save page sample** without expanding anything. This is sample 1.
3. Click **...more** on the first two posts so their full text shows. Press **Save page sample** again. This is sample 2.
4. Scroll to the bottom of the loaded results. Note whether more results load by themselves or a button appears, and the button's exact text.
5. Open `https://www.linkedin.com/feed/`, reload, wait for posts, press **Save page sample**. This is sample 3.
6. Open `http://127.0.0.1:4777/samples` and check the three samples are listed and "view page" shows the page. If the panel said the server was not reachable, the sample went to Downloads instead: move those `linkedin-sample-*.json` files to `exports/linkedin-samples/`.
7. Optional, only if a sample's details (`.json`) show an empty `idScan`: DevTools > Network > Fetch/XHR, scroll the search results, find a request whose response contains `urn:li:activity`. Note its path (no headers, no cookies) and save its response body to `exports/linkedin-samples/network-1.txt`.

## 3. Autofill

1. Open any Greenhouse posting (`boards.greenhouse.io/...` or `job-boards.greenhouse.io/...`) and go to the application form. Or a Lever posting (`jobs.lever.co/...`) and press Apply.
2. Reload the tab. Side panel > **Profile** > Import JSON > `profile/profile.json`.
3. Side panel > **Autofill**. **PASTE** the detection line ("Detected greenhouse · N known fields").
4. Press **Fill this page**. **PASTE** the Filled / Skipped / Not found lists and the "unknown fields" list. Do not submit the application.

## 4. What to do with the results

Paste everything back to the agent that wrote the extension. The diagnose outline is enough to fix `src/content/linkedin/selectors.ts`; the fill report is enough to fix `src/content/autofill/adapters/*.ts`.
