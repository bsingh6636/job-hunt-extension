import { onMessage, sendToRuntime } from '../messages';
import type { Application, ExtractedPost, FillReport, Profile, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { ApiRepository } from './ApiRepository';
import { LocalRepository, LocalValueStore } from './LocalRepository';
import type { Entity, Repository } from './Repository';

/**
 * Single place that decides where data lives.
 *
 * - settings and profile: always chrome.storage.local (the settings decide
 *   the storage mode, so they cannot live behind it)
 * - posts, applications, fill reports: SwitchingRepository, which routes to
 *   the local SQLite server (default) or chrome.storage.local depending on
 *   settings.storage.mode. Call sites never know which.
 */
export const profileStore = new LocalValueStore<Profile>('profile');
export const settingsStore = new LocalValueStore<Settings>('settings');

export async function getSettings(): Promise<Settings> {
  const saved = await settingsStore.get();
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    keywords: { ...DEFAULT_SETTINGS.keywords, ...saved?.keywords },
    extract: { ...DEFAULT_SETTINGS.extract, ...saved?.extract },
    autofill: { ...DEFAULT_SETTINGS.autofill, ...saved?.autofill },
    storage: { ...DEFAULT_SETTINGS.storage, ...saved?.storage },
  };
}

class SwitchingRepository<T extends Entity> implements Repository<T> {
  private readonly local: LocalRepository<T>;
  private api: ApiRepository<T> | null = null;
  private apiUrl = '';
  private readonly listeners = new Set<() => void>();

  constructor(private readonly name: string) {
    this.local = new LocalRepository<T>(name);
  }

  private async target(): Promise<Repository<T>> {
    const { storage } = await getSettings();
    if (storage.mode !== 'server') return this.local;
    if (!this.api || this.apiUrl !== storage.serverUrl) {
      this.api = new ApiRepository<T>(storage.serverUrl, this.name);
      this.apiUrl = storage.serverUrl;
    }
    return this.api;
  }

  private async changed(): Promise<void> {
    for (const l of this.listeners) l();
    try {
      await sendToRuntime('DATA_CHANGED', { collection: this.name });
    } catch {
      // nobody else listening
    }
  }

  async get(id: string) {
    return (await this.target()).get(id);
  }
  async list() {
    return (await this.target()).list();
  }
  async put(item: T) {
    await (await this.target()).put(item);
    await this.changed();
  }
  async putMany(items: T[]) {
    await (await this.target()).putMany(items);
    await this.changed();
  }
  async remove(id: string) {
    await (await this.target()).remove(id);
    await this.changed();
  }
  async removeMany(ids: string[]) {
    await (await this.target()).removeMany(ids);
    await this.changed();
  }
  async clear() {
    await (await this.target()).clear();
    await this.changed();
  }

  subscribe(listener: (items: T[]) => void): () => void {
    const refetch = () => {
      void this.list()
        .then(listener)
        .catch(() => listener([]));
    };
    this.listeners.add(refetch);
    const unsubLocal = this.local.subscribe(listener);
    const unsubMsg = onMessage({
      DATA_CHANGED: ({ collection }) => {
        if (collection === this.name) refetch();
      },
    });
    const unsubSettings = settingsStore.subscribe(refetch);
    return () => {
      this.listeners.delete(refetch);
      unsubLocal();
      unsubMsg();
      unsubSettings();
    };
  }
}

export const postsRepo: Repository<ExtractedPost> = new SwitchingRepository<ExtractedPost>('posts');
export const applicationsRepo: Repository<Application> = new SwitchingRepository<Application>('applications');
export const fillReportsRepo: Repository<FillReport & { id: string }> = new SwitchingRepository<FillReport & { id: string }>('fillReports');

export { checkServer } from './ApiRepository';
export type { Repository, ValueStore } from './Repository';
