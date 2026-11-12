import { useCallback, useEffect, useMemo, useState } from 'react';
import { onMessage } from '@shared/messages';
import { getSettings, postsRepo, settingsStore } from '@shared/storage';
import { POST_STATUSES, type ExtractMode, type ExtractProgress, type ExtractedPost, type PostStatus } from '@shared/types';
import { PostCard } from '../components/PostCard';
import { download, postsToCsv, postsToJson, postsToText, copyText, stamp } from '../lib/export';
import { useFlash, useRepository, useValueStore } from '../lib/hooks';
import { saveSample as storeSample, serverBase, type SavedSample } from '../lib/samples';
import { storageStatus, type ServerStatus } from '../lib/server';
import { askTab, isLinkedInUrl } from '../lib/tabs';

interface Props {
  activeTab: chrome.tabs.Tab | undefined;
}

type ContactFilter = 'any' | 'email' | 'link' | 'either' | 'none';
const CONTACT_FILTERS: Record<ContactFilter, { label: string; test: (p: ExtractedPost) => boolean }> = {
  any: { label: 'any contact', test: () => true },
  either: { label: 'has email or link', test: (p) => p.emails.length > 0 || p.links.length > 0 },
  email: { label: 'has email', test: (p) => p.emails.length > 0 },
  link: { label: 'has link', test: (p) => p.links.length > 0 },
  none: { label: 'no email, no link', test: (p) => p.emails.length === 0 && p.links.length === 0 },
};

export function PostsPage({ activeTab }: Props) {
  const { items: posts } = useRepository(postsRepo);
  const { value: settings } = useValueStore(settingsStore);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useFlash();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [diagnose, setDiagnose] = useState('');
  const [sampleNote, setSampleNote] = useState('');
  const [savedSample, setSavedSample] = useState<SavedSample | null>(null);
  const [savingSample, setSavingSample] = useState(false);
  const [samplesIndex, setSamplesIndex] = useState('');
  /** Posts to capture on Extract; starts from Settings and is saved back when used. */
  const [count, setCount] = useState('');

  useEffect(() => {
    if (settings?.extract?.maxPosts && !count) setCount(String(settings.extract.maxPosts));
  }, [settings?.extract?.maxPosts, count]);

  useEffect(() => {
    void serverBase().then((base) => setSamplesIndex(`${base}/samples`));
  }, [settings?.storage.serverUrl]);

  // Filters
  const [query, setQuery] = useState('');
  const [contact, setContact] = useState<ContactFilter>('any');
  const [hideExcluded, setHideExcluded] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all');
  const [keyword, setKeyword] = useState<string | null>(null);

  useEffect(() => onMessage({ LINKEDIN_EXTRACT_PROGRESS: ({ progress }) => setProgress(progress) }), []);

  const refreshStatus = useCallback(() => void storageStatus().then(setStatus), []);
  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 10000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, settings?.storage.mode, settings?.storage.serverUrl]);

  const onLinkedIn = isLinkedInUrl(activeTab?.url);
  const running = !!progress?.running && !progress.done;

  const start = async (mode: ExtractMode) => {
    if (!activeTab?.id) return;
    setError('');
    const current = await storageStatus();
    setStatus(current);
    if (!current.ok) {
      setError(current.message);
      return;
    }
    try {
      const saved = await getSettings();
      let { extract } = saved;
      const wanted = Math.floor(Number(count));
      if (mode === 'fresh' && wanted >= 1 && wanted !== extract.maxPosts) {
        extract = { ...extract, maxPosts: wanted };
        await settingsStore.set({ ...saved, extract });
      }
      const res = await askTab(activeTab.id, 'LINKEDIN_EXTRACT_START', { options: extract, mode });
      if (!res.started) setError(res.reason ?? 'Could not start');
      else setProgress({ running: true, seen: 0, sent: 0, message: mode === 'more' ? `Loading ${extract.moreBatch} more...` : 'Starting...' });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const stop = async () => {
    if (activeTab?.id) await askTab(activeTab.id, 'LINKEDIN_EXTRACT_STOP', {}).catch(() => undefined);
  };
  const runDiagnose = async () => {
    if (!activeTab?.id) return;
    setError('');
    try {
      const report = await askTab(activeTab.id, 'LINKEDIN_DIAGNOSE', {});
      const text = JSON.stringify(report, null, 2);
      setDiagnose(text);
      await copyText(text);
      setFlash('Diagnose report copied to clipboard');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveSample = async () => {
    if (!activeTab?.id) return;
    setError('');
    setSavedSample(null);
    setSavingSample(true);
    try {
      const sample = await askTab(activeTab.id, 'LINKEDIN_SAMPLE', { note: sampleNote });
      setSavedSample(await storeSample(sample));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSample(false);
    }
  };

  const includeKeywords = settings?.keywords.include ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter(CONTACT_FILTERS[contact].test)
      .filter((p) => !hideExcluded || p.excludedBy.length === 0)
      .filter((p) => statusFilter === 'all' || p.status === statusFilter)
      .filter((p) => !keyword || p.matchedKeywords.includes(keyword))
      .filter((p) => !q || `${p.text} ${p.author.name} ${p.author.headline ?? ''} ${p.emails.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (b.postedAt ?? b.capturedAt).localeCompare(a.postedAt ?? a.capturedAt));
  }, [posts, query, contact, hideExcluded, statusFilter, keyword]);

  const withEmail = posts.filter((p) => p.emails.length > 0).length;
  const withLink = posts.filter((p) => p.links.length > 0).length;
  const withNeither = posts.filter(CONTACT_FILTERS.none.test).length;

  const bulk = {
    copyJson: () => copyText(postsToJson(filtered)).then(() => setFlash('Copied JSON')),
    copyCsv: () => copyText(postsToCsv(filtered)).then(() => setFlash('Copied CSV')),
    copyText: () => copyText(postsToText(filtered)).then(() => setFlash('Copied text')),
    dlJson: () => download(`linkedin-posts-${stamp()}.json`, postsToJson(filtered), 'application/json'),
    dlCsv: () => download(`linkedin-posts-${stamp()}.csv`, postsToCsv(filtered), 'text/csv'),
    deleteFiltered: async () => {
      if (!confirm(`Delete ${filtered.length} post(s) currently shown?`)) return;
      await postsRepo.removeMany(filtered.map((p) => p.id));
    },
    clearAll: async () => {
      if (!confirm(`Delete ALL ${posts.length} stored posts?`)) return;
      await postsRepo.clear();
    },
  };

  return (
    <div>
      <h2>LinkedIn posts</h2>

      {status && (
        <div className={status.ok ? 'status-bar' : 'status-bar error'}>
          {status.ok ? status.message : `${status.message} (Settings tab to change storage mode)`}
        </div>
      )}

      <div className="status-bar">
        {onLinkedIn ? (
          <>
            <div className="row">
              {!running ? (
                <>
                  <label className="check" title="Posts to capture, starting from the top of the results">
                    posts
                    <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: '5em' }} />
                  </label>
                  <button className="primary" onClick={() => void start('fresh')}>
                    Extract
                  </button>
                  <button onClick={() => void start('more')} title="Capture the next posts not yet captured on this page, continuing where the last run stopped">
                    More (+{settings?.extract?.moreBatch ?? 20})
                  </button>
                </>
              ) : (
                <button className="danger" onClick={() => void stop()}>
                  Stop
                </button>
              )}
              <button onClick={() => void runDiagnose()} title="Describe the page structure so selectors can be fixed">
                Diagnose page
              </button>
              <span className="muted">{progress?.message ?? 'Run a search or open the feed, then extract.'}</span>
            </div>
            {error && <div className="error">{error}</div>}
            {diagnose && (
              <details>
                <summary>Diagnose report (copied to clipboard; paste it to the agent fixing selectors)</summary>
                <pre>{diagnose}</pre>
              </details>
            )}
            <details>
              <summary>Page sample for fixing extraction (saves the full page HTML on this laptop)</summary>
              <label className="field">
                <span>Notes saved inside the file, e.g. post links from "Copy link to post" with the author name</span>
                <textarea rows={4} value={sampleNote} onChange={(e) => setSampleNote(e.target.value)} />
              </label>
              <div className="row">
                <button onClick={() => void saveSample()} disabled={savingSample}>
                  {savingSample ? 'Saving...' : 'Save page sample'}
                </button>
                {samplesIndex && (
                  <a href={samplesIndex} target="_blank" rel="noreferrer">
                    browse saved samples
                  </a>
                )}
              </div>
              {savedSample?.where === 'server' && (
                <div className="success small">
                  Saved {Math.round(savedSample.htmlBytes / 1024)} KB to {savedSample.file}.{' '}
                  <a href={savedSample.viewUrl} target="_blank" rel="noreferrer">
                    view page
                  </a>{' '}
                  ·{' '}
                  <a href={savedSample.detailsUrl} target="_blank" rel="noreferrer">
                    details
                  </a>
                </div>
              )}
              {savedSample?.where === 'download' && (
                <div className="error small">
                  Server not reachable ({savedSample.serverError}). Downloaded {savedSample.file} to Downloads instead.
                </div>
              )}
            </details>
          </>
        ) : (
          <span className="muted">Open a LinkedIn feed or search tab to extract posts.</span>
        )}
      </div>

      <div className="row">
        <span className="muted small">
          {posts.length} stored · {withEmail} with email · {withLink} with link · {withNeither} with neither · {filtered.length} shown
        </span>
      </div>

      <input type="search" placeholder="Search text, author, email" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="row">
        <select value={contact} onChange={(e) => setContact(e.target.value as ContactFilter)} style={{ width: 'auto' }}>
          {(Object.keys(CONTACT_FILTERS) as ContactFilter[]).map((k) => (
            <option key={k} value={k}>
              {CONTACT_FILTERS[k].label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={hideExcluded} onChange={(e) => setHideExcluded(e.target.checked)} /> hide excluded
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PostStatus | 'all')} style={{ width: 'auto' }}>
          <option value="all">all statuses</option>
          {POST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {includeKeywords.length > 0 && (
        <div className="chips">
          {includeKeywords.map((k) => (
            <span key={k} className={keyword === k ? 'chip kw on' : 'chip kw'} onClick={() => setKeyword(keyword === k ? null : k)}>
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="row">
        <button onClick={() => void bulk.copyText()}>Copy all details</button>
        <button onClick={() => void bulk.copyCsv()}>Copy CSV</button>
        <button onClick={() => void bulk.copyJson()}>Copy JSON</button>
        <button onClick={bulk.dlCsv}>Download CSV</button>
        <button onClick={bulk.dlJson}>Download JSON</button>
        <button className="danger" onClick={() => void bulk.deleteFiltered()} disabled={filtered.length === 0}>
          Delete shown
        </button>
        <button className="danger" onClick={() => void bulk.clearAll()} disabled={posts.length === 0}>
          Clear all
        </button>
        {flash && <span className="success small">{flash}</span>}
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No posts match.</p>
      ) : (
        filtered.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </div>
  );
}
