import { getSettings } from '@shared/storage';
import type { PageSample } from '../../content/linkedin/sample';
import { download, stamp } from './export';

export interface SavedSample {
  where: 'server' | 'download';
  htmlBytes: number;
  /** Server: absolute file path on disk. Download: file name in Downloads. */
  file: string;
  viewUrl?: string;
  detailsUrl?: string;
  indexUrl?: string;
  /** Why the server was not used, when it fell back to a download. */
  serverError?: string;
}

/** Base URL of the local server, whatever the storage mode. */
export async function serverBase(): Promise<string> {
  const { storage } = await getSettings();
  return storage.serverUrl.replace(/\/+$/, '');
}

/**
 * Send a page sample to the local server (POST /samples), which writes
 * server/data/samples/<id>.html + .json and serves them for viewing.
 * Falls back to a download into Downloads when the server is unreachable.
 */
export async function saveSample(sample: PageSample): Promise<SavedSample> {
  const base = await serverBase();
  const { html, htmlBytes, ...meta } = sample;
  try {
    const res = await fetch(`${base}/samples`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meta, html }),
    });
    if (!res.ok) throw new Error(`server answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const saved = (await res.json()) as { id: string; htmlFile: string; viewUrl: string; detailsUrl: string; indexUrl: string };
    return {
      where: 'server',
      htmlBytes,
      file: saved.htmlFile,
      viewUrl: base + saved.viewUrl,
      detailsUrl: base + saved.detailsUrl,
      indexUrl: base + saved.indexUrl,
    };
  } catch (err) {
    const name = `linkedin-sample-${stamp()}.json`;
    download(name, JSON.stringify(sample, null, 2), 'application/json');
    return { where: 'download', htmlBytes, file: name, serverError: (err as Error).message };
  }
}
