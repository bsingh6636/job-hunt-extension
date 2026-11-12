import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createSampleStore } from './samples.mjs';
import { createStore } from './store.mjs';

/**
 * Local storage server for the extension. Run with `npm run server`.
 * Data lives in server/data/jobhunt.sqlite (override with JOBHUNT_DB).
 * Page samples live in server/data/samples/ (override with JOBHUNT_SAMPLES).
 * Binds to 127.0.0.1 only; nothing is reachable from the network.
 */
const PORT = Number(process.env.PORT ?? 4777);
const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
mkdirSync(dataDir, { recursive: true });
const DB_PATH = process.env.JOBHUNT_DB ?? path.join(dataDir, 'jobhunt.sqlite');

const SAMPLES_DIR = process.env.JOBHUNT_SAMPLES ?? path.join(dataDir, 'samples');

const store = createStore(DB_PATH);
const samples = createSampleStore(SAMPLES_DIR);
const app = createApp(store, { samples, log: (line) => console.log(`[server] ${line}`) });

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Job Hunt storage listening on http://127.0.0.1:${PORT}`);
  console.log(`[server] SQLite file: ${DB_PATH}`);
  console.log(`[server] Page samples: ${SAMPLES_DIR}  (browse http://127.0.0.1:${PORT}/samples)`);
  console.log(`[server] counts: ${JSON.stringify(store.counts())}`);
});

const shutdown = () => {
  console.log('[server] shutting down');
  app.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
