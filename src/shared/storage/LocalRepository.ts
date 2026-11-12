import type { Entity, Repository, ValueStore } from './Repository';

type Collection<T> = Record<string, T>;

const area = () => chrome.storage.local;

/** Repository backed by chrome.storage.local. One storage key per collection. */
export class LocalRepository<T extends Entity> implements Repository<T> {
  private readonly key: string;

  constructor(name: string) {
    this.key = `collection:${name}`;
  }

  private async read(): Promise<Collection<T>> {
    const result = await area().get(this.key);
    return (result[this.key] as Collection<T> | undefined) ?? {};
  }

  private async write(data: Collection<T>): Promise<void> {
    await area().set({ [this.key]: data });
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.read())[id];
  }

  async list(): Promise<T[]> {
    return Object.values(await this.read());
  }

  async put(item: T): Promise<void> {
    const data = await this.read();
    data[item.id] = item;
    await this.write(data);
  }

  async putMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const data = await this.read();
    for (const item of items) data[item.id] = item;
    await this.write(data);
  }

  async remove(id: string): Promise<void> {
    const data = await this.read();
    delete data[id];
    await this.write(data);
  }

  async removeMany(ids: string[]): Promise<void> {
    const data = await this.read();
    for (const id of ids) delete data[id];
    await this.write(data);
  }

  async clear(): Promise<void> {
    await area().remove(this.key);
  }

  subscribe(listener: (items: T[]) => void): () => void {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !(this.key in changes)) return;
      const next = (changes[this.key]?.newValue as Collection<T> | undefined) ?? {};
      listener(Object.values(next));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }
}

export class LocalValueStore<T> implements ValueStore<T> {
  private readonly key: string;

  constructor(name: string) {
    this.key = `value:${name}`;
  }

  async get(): Promise<T | undefined> {
    const result = await area().get(this.key);
    return result[this.key] as T | undefined;
  }

  async set(value: T): Promise<void> {
    await area().set({ [this.key]: value });
  }

  async clear(): Promise<void> {
    await area().remove(this.key);
  }

  subscribe(listener: (value: T | undefined) => void): () => void {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !(this.key in changes)) return;
      listener(changes[this.key]?.newValue as T | undefined);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }
}
