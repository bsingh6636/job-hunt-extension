import { useCallback, useEffect, useRef, useState } from 'react';
import type { Repository, ValueStore } from '@shared/storage';
import type { Entity } from '@shared/storage/Repository';

/** Live view of a repository collection. */
export function useRepository<T extends Entity>(repo: Repository<T>): { items: T[]; loading: boolean; refresh: () => Promise<void> } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setItems(await repo.list());
    setLoading(false);
  }, [repo]);
  useEffect(() => {
    void refresh();
    return repo.subscribe((next) => setItems(next));
  }, [repo, refresh]);
  return { items, loading, refresh };
}

/** Live view of a single stored value. */
export function useValueStore<T>(store: ValueStore<T>): { value: T | undefined; set: (v: T) => Promise<void>; clear: () => Promise<void>; loading: boolean } {
  const [value, setValue] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void store.get().then((v) => {
      setValue(v);
      setLoading(false);
    });
    return store.subscribe((v) => setValue(v));
  }, [store]);
  return { value, set: (v) => store.set(v), clear: () => store.clear(), loading };
}

/** The tab the side panel is attached to, kept current as the user navigates. */
export function useActiveTab(): chrome.tabs.Tab | undefined {
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  useEffect(() => {
    const load = async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTab(active);
    };
    void load();
    const onActivated = () => void load();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo, updated: chrome.tabs.Tab) => {
      if (updated.active && (info.url || info.status === 'complete' || info.title)) void load();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}

/** Debounced callback that always sees the latest function. */
export function useDebounced<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): (...args: A) => void {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<number | undefined>(undefined);
  return useCallback(
    (...args: A) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => ref.current(...args), delayMs);
    },
    [delayMs],
  );
}

/** Short-lived status text ("Copied!"). */
export function useFlash(ms = 1800): [string, (msg: string) => void] {
  const [msg, setMsg] = useState('');
  const flash = useCallback(
    (m: string) => {
      setMsg(m);
      window.setTimeout(() => setMsg(''), ms);
    },
    [ms],
  );
  return [msg, flash];
}
