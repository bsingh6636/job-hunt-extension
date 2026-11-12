import { onMessage } from '@shared/messages';
import { log } from '@shared/utils/log';
import { detectAdapter } from './adapters';
import { runFill } from './engine';

/**
 * Autofill content script. Injected on every ATS host in the manifest; idle
 * until the side panel asks it to detect or fill. Workday is a single-page
 * app, so detection runs on each request rather than once at load.
 */
onMessage({
  PING: () => ({ ok: true, where: 'autofill-content' }),
  AUTOFILL_DETECT: () => {
    const adapter = detectAdapter();
    const fieldsOnPage = adapter ? adapter.fields.filter((f) => f.locate(document)).length : 0;
    return { adapter: adapter?.name ?? null, fieldsOnPage };
  },
  AUTOFILL_RUN: async ({ profile, fillEmptyOnly, highlight }) => {
    const adapter = detectAdapter();
    if (!adapter) throw new Error('No adapter matches this page');
    log.info('autofill start', adapter.name);
    const report = await runFill(adapter, profile, { fillEmptyOnly, highlight });
    log.info('autofill done', report);
    return report;
  },
});

log.debug('autofill content script ready');
