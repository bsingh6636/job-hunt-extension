/**
 * The data layer every feature talks to. Phase 1 backs it with
 * chrome.storage.local; Phase 2 swaps in ApiRepository without touching the
 * UI, content scripts or background handlers.
 */
export interface Entity {
  id: string;
}

export interface Repository<T extends Entity> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  clear(): Promise<void>;
  /** Called with the full list whenever the collection changes. */
  subscribe(listener: (items: T[]) => void): () => void;
}

/** A single stored value (profile, settings). */
export interface ValueStore<T> {
  get(): Promise<T | undefined>;
  set(value: T): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: (value: T | undefined) => void): () => void;
}
