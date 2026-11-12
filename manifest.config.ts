import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

/**
 * Manifest V3 definition. Keep every host the extension touches listed here;
 * adding a new ATS means adding its match pattern to BOTH host_permissions and
 * the autofill content script below, then registering an adapter in
 * src/content/autofill/adapters/index.ts.
 */
export const ATS_HOSTS = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://job-boards.eu.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://*.myworkdayjobs.com/*',
  'https://*.myworkdaysite.com/*',
];

export const LINKEDIN_HOSTS = ['https://www.linkedin.com/*'];

/** The local storage server (server/index.mjs). */
export const SERVER_HOSTS = ['http://127.0.0.1/*', 'http://localhost/*'];

export default defineManifest({
  manifest_version: 3,
  name: 'Job Hunt Assistant',
  version: pkg.version,
  description: pkg.description,
  action: { default_title: 'Open Job Hunt Assistant' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'tabs', 'activeTab', 'scripting', 'clipboardWrite'],
  host_permissions: [...LINKEDIN_HOSTS, ...ATS_HOSTS, ...SERVER_HOSTS],
  content_scripts: [
    { matches: LINKEDIN_HOSTS, js: ['src/content/linkedin/index.ts'], run_at: 'document_idle' },
    { matches: ATS_HOSTS, js: ['src/content/autofill/index.ts'], run_at: 'document_idle' },
  ],
});
