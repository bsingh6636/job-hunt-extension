import { checkServer, getSettings } from '@shared/storage';

export interface ServerStatus {
  mode: 'server' | 'browser';
  url: string;
  ok: boolean;
  message: string;
  counts?: Record<string, number>;
  db?: string;
}

/** Where data is going right now, and whether that place is reachable. */
export async function storageStatus(): Promise<ServerStatus> {
  const { storage } = await getSettings();
  if (storage.mode === 'browser') {
    return { mode: 'browser', url: '', ok: true, message: 'Storing in this browser (chrome.storage.local)' };
  }
  try {
    const health = await checkServer(storage.serverUrl);
    return {
      mode: 'server',
      url: storage.serverUrl,
      ok: true,
      message: `Storing in SQLite on this laptop (${health.db})`,
      counts: health.counts,
      db: health.db,
    };
  } catch (err) {
    return { mode: 'server', url: storage.serverUrl, ok: false, message: (err as Error).message };
  }
}
