# Instructions for agents working in this repository

Read `README.md` first. It is the single source of truth for this project, and its section **"Rules for making changes"** is binding for every change you make here.

Short version:

- Any change to behaviour, settings, messages, storage keys, files, scripts, adapters, hosts, or limitations must update `README.md` in the same change, and must add a dated row to the README change log naming you as the agent.
- Keep `docs/ARCHITECTURE.md`, `docs/ADDING_AN_ADAPTER.md`, `docs/AI_EXTENSION_POINTS.md`, `docs/LIVE_TEST.md` in sync when you touch those areas.
- Never commit personal data. `profile/profile.json` is git-ignored and must stay that way.
- Storage defaults to the local SQLite server (`server/`, `npm run server`). Never add browser caching of posts in server mode. Server stays on 127.0.0.1.
- If you are testing on a live LinkedIn page and extraction fails, use Posts > Diagnose page and follow `docs/LIVE_TEST.md`; fix only `src/content/linkedin/selectors.ts` (class selectors in `SEL`, structural patterns in `STRUCT`) unless the structure forces more. Real HTML is in `server/data/samples/` once someone has pressed **Save page sample**; read it from disk.
- Layer rules: content scripts never touch storage; adapters never mutate the DOM; all LinkedIn selectors live in `src/content/linkedin/selectors.ts`; new ATS hosts go in `ATS_HOSTS` in `manifest.config.ts`; new messages go in `MessageMap` in `src/shared/messages.ts`.
- Before finishing: `npm run typecheck`, `npm test`, `npm run build` must all pass. Report failures honestly.
- Do not commit or push unless asked.
