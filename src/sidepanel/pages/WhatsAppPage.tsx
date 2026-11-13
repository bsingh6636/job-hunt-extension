import { useCallback, useEffect, useMemo, useState } from 'react';
import { onMessage } from '@shared/messages';
import { getSettings, settingsStore, whatsappRepo } from '@shared/storage';
import { DEFAULT_SETTINGS, POST_STATUSES, type ExtractMode, type ExtractProgress, type PostStatus, type WhatsAppPost } from '@shared/types';
import { fitsExperience } from '@shared/utils/jobtext';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { copyText, download, stamp, whatsappListToText, whatsappToCsv, whatsappToJson } from '../lib/export';
import { useFlash, useRepository, useValueStore } from '../lib/hooks';
import { storageStatus, type ServerStatus } from '../lib/server';
import { askTab, isWhatsAppUrl } from '../lib/tabs';

interface Props {
  activeTab: chrome.tabs.Tab | undefined;
}

type ContactFilter = 'any' | 'reach' | 'email' | 'phone' | 'link' | 'none';
const CONTACT_FILTERS: Record<ContactFilter, { label: string; test: (p: WhatsAppPost) => boolean }> = {
  any: { label: 'any contact', test: () => true },
  reach: { label: 'has email or phone', test: (p) => p.emails.length > 0 || p.phones.length > 0 },
  email: { label: 'has email', test: (p) => p.emails.length > 0 },
  phone: { label: 'has phone', test: (p) => p.phones.length > 0 },
  link: { label: 'has link', test: (p) => p.links.length > 0 },
  none: { label: 'no email, phone or link', test: (p) => p.emails.length === 0 && p.phones.length === 0 && p.links.length === 0 },
};

/** Remembered in this panel only: the years of experience to filter by. */
const YEARS_KEY = 'jh.waYears';
const readYears = () => {
  try {
    return localStorage.getItem(YEARS_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * Job posts from WhatsApp groups. Separate from the LinkedIn Posts tab and
 * stored in its own collection (whatsappPosts / SQL view whatsapp_posts).
 */
export function WhatsAppPage({ activeTab }: Props) {
  const { items: posts } = useRepository(whatsappRepo);
  const { value: settings } = useValueStore(settingsStore);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useFlash();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [chat, setChat] = useState<{ name: string | null; messages: number } | null>(null);
  const [diagnose, setDiagnose] = useState('');
  /** Job posts per Extract and the age limit: follow Settings until edited here, saved back when used. */
  const wa = { ...DEFAULT_SETTINGS.whatsapp, ...settings?.whatsapp };
  const [countInput, setCount] = useState<string | null>(null);
  const [daysInput, setDays] = useState<string | null>(null);
  const count = countInput ?? String(wa.maxPosts);
  const days = daysInput ?? String(wa.maxAgeDays);

  // Filters
  const [query, setQuery] = useState('');
  const [contact, setContact] = useState<ContactFilter>('any');
  const [group, setGroup] = useState('all');
  const [years, setYears] = useState(readYears);
  const [hideExcluded, setHideExcluded] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all');
  const [keyword, setKeyword] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(YEARS_KEY, years);
    } catch {
      /* ignore */
    }
  }, [years]);

  useEffect(() => onMessage({ WHATSAPP_EXTRACT_PROGRESS: ({ progress }) => setProgress(progress) }), []);

  const refreshStatus = useCallback(() => void storageStatus().then(setStatus), []);
  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 10000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, settings?.storage.mode, settings?.storage.serverUrl]);

  const onWhatsApp = isWhatsAppUrl(activeTab?.url);
  const running = !!progress?.running && !progress.done;

  // WhatsApp Web keeps one URL for every chat, so poll which chat is open.
  useEffect(() => {
    if (!onWhatsApp || !activeTab?.id) {
      setChat(null);
      return;
    }
    const tabId = activeTab.id;
    const poll = () =>
      void askTab(tabId, 'WHATSAPP_STATUS', {})
        .then((s) => setChat({ name: s.chat, messages: s.messagesOnPage }))
        .catch(() => setChat(null));
    poll();
    const timer = window.setInterval(poll, 4000);
    return () => window.clearInterval(timer);
  }, [onWhatsApp, activeTab?.id]);

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
      await whatsappRepo.list();
    } catch (err) {
      const message = (err as Error).message;
      setError(
        /unknown collection/i.test(message)
          ? 'The storage server is an older version without WhatsApp posts. Stop it (Ctrl+C) and run npm run server again.'
          : message,
      );
      return;
    }
    try {
      const saved = await getSettings();
      let { whatsapp } = saved;
      const wanted = Math.floor(Number(count));
      const maxAgeDays = days.trim() === '' ? whatsapp.maxAgeDays : Math.max(0, Math.floor(Number(days) || 0));
      if ((mode === 'fresh' && wanted >= 1 && wanted !== whatsapp.maxPosts) || maxAgeDays !== whatsapp.maxAgeDays) {
        whatsapp = { ...whatsapp, ...(mode === 'fresh' && wanted >= 1 ? { maxPosts: wanted } : {}), maxAgeDays };
        await settingsStore.set({ ...saved, whatsapp });
      }
      const res = await askTab(activeTab.id, 'WHATSAPP_EXTRACT_START', { options: whatsapp, mode });
      if (!res.started) setError(res.reason ?? 'Could not start');
      else setProgress({ running: true, seen: 0, sent: 0, message: mode === 'more' ? `Loading ${whatsapp.moreBatch} more...` : 'Starting...' });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const stop = async () => {
    if (activeTab?.id) await askTab(activeTab.id, 'WHATSAPP_EXTRACT_STOP', {}).catch(() => undefined);
  };
  const runDiagnose = async () => {
    if (!activeTab?.id) return;
    setError('');
    try {
      const text = JSON.stringify(await askTab(activeTab.id, 'WHATSAPP_DIAGNOSE', {}), null, 2);
      setDiagnose(text);
      await copyText(text);
      setFlash('Diagnose report copied to clipboard');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const includeKeywords = settings?.keywords.include ?? [];
  const groups = useMemo(() => Array.from(new Set(posts.flatMap((p) => p.sightings.map((s) => s.chat)))).sort(), [posts]);
  const myYears = years.trim() === '' ? undefined : Number(years);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter(CONTACT_FILTERS[contact].test)
      .filter((p) => group === 'all' || p.sightings.some((s) => s.chat === group))
      .filter((p) => myYears === undefined || !Number.isFinite(myYears) || fitsExperience(p.experience, myYears))
      .filter((p) => !hideExcluded || p.excludedBy.length === 0)
      .filter((p) => statusFilter === 'all' || p.status === statusFilter)
      .filter((p) => !keyword || p.matchedKeywords.includes(keyword))
      .filter((p) => !q || `${p.text} ${p.sender.name} ${p.chat} ${p.emails.join(' ')} ${p.phones.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (b.postedAt ?? b.capturedAt).localeCompare(a.postedAt ?? a.capturedAt));
  }, [posts, query, contact, group, myYears, hideExcluded, statusFilter, keyword]);

  const withEmail = posts.filter((p) => p.emails.length > 0).length;
  const withPhone = posts.filter((p) => p.phones.length > 0).length;
  const fitting = myYears !== undefined && Number.isFinite(myYears) ? posts.filter((p) => fitsExperience(p.experience, myYears)).length : undefined;

  const bulk = {
    copyText: () => copyText(whatsappListToText(filtered)).then(() => setFlash('Copied text')),
    copyCsv: () => copyText(whatsappToCsv(filtered)).then(() => setFlash('Copied CSV')),
    copyJson: () => copyText(whatsappToJson(filtered)).then(() => setFlash('Copied JSON')),
    dlCsv: () => download(`whatsapp-posts-${stamp()}.csv`, whatsappToCsv(filtered), 'text/csv'),
    dlJson: () => download(`whatsapp-posts-${stamp()}.json`, whatsappToJson(filtered), 'application/json'),
    deleteFiltered: async () => {
      if (!confirm(`Delete ${filtered.length} WhatsApp post(s) currently shown?`)) return;
      await whatsappRepo.removeMany(filtered.map((p) => p.id));
    },
    clearAll: async () => {
      if (!confirm(`Delete ALL ${posts.length} stored WhatsApp posts?`)) return;
      await whatsappRepo.clear();
    },
  };

  return (
    <div>
      <h2>WhatsApp group job posts</h2>

      {status && (
        <div className={status.ok ? 'status-bar' : 'status-bar error'}>
          {status.ok ? status.message : `${status.message} (Settings tab to change storage mode)`}
        </div>
      )}

      <div className="status-bar">
        {onWhatsApp ? (
          <>
            <div className="muted">
              {chat?.name ? (
                <>
                  Chat: <strong>{chat.name}</strong> · {chat.messages} messages loaded
                </>
              ) : chat ? (
                'No chat open. Click a group on the left.'
              ) : (
                'The page has not loaded the extension script. Reload the WhatsApp tab.'
              )}
            </div>
            <div className="row">
              {!running ? (
                <>
                  <label className="check" title="Job posts to capture, newest first. Other messages are read but not stored.">
                    job posts
                    <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: '5em' }} />
                  </label>
                  <label className="check" title="Stop at messages older than this many days. 0 = no limit.">
                    back
                    <input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: '4em' }} />
                    days
                  </label>
                  <button className="primary" onClick={() => void start('fresh')}>
                    Extract
                  </button>
                  <button onClick={() => void start('more')} title="Continue further back in this chat, capturing the next job posts not captured yet">
                    More (+{wa.moreBatch})
                  </button>
                </>
              ) : (
                <button className="danger" onClick={() => void stop()}>
                  Stop
                </button>
              )}
              <button onClick={() => void runDiagnose()} title="Describe the chat's page structure (no message text) so selectors can be fixed">
                Diagnose chat
              </button>
            </div>
            <div className="muted">{progress?.message ?? 'Open a group, then extract. It reads from the newest message back.'}</div>
            {error && <div className="error">{error}</div>}
            {diagnose && (
              <details>
                <summary>Diagnose report (copied to clipboard; paste it to the agent fixing selectors)</summary>
                <pre>{diagnose}</pre>
              </details>
            )}
          </>
        ) : (
          <span className="muted">
            Open{' '}
            <a href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">
              web.whatsapp.com
            </a>{' '}
            and a group chat to extract job posts.
          </span>
        )}
      </div>

      <div className="row">
        <span className="muted small">
          {posts.length} stored · {withEmail} with email · {withPhone} with phone
          {fitting !== undefined ? ` · ${fitting} fit ${myYears} yrs` : ''} · {filtered.length} shown
        </span>
      </div>

      <input type="search" placeholder="Search text, sender, group, email, phone" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="row">
        <select value={contact} onChange={(e) => setContact(e.target.value as ContactFilter)} style={{ width: 'auto' }}>
          {(Object.keys(CONTACT_FILTERS) as ContactFilter[]).map((k) => (
            <option key={k} value={k}>
              {CONTACT_FILTERS[k].label}
            </option>
          ))}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 'auto', maxWidth: '12em' }}>
          <option value="all">all groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <label className="check" title="Hide posts that ask for more years than this. Posts that state no experience stay visible. Empty = off.">
          my years
          <input type="number" min={0} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} style={{ width: '4em' }} />
        </label>
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

      {filtered.length === 0 ? <p className="muted">No WhatsApp posts match.</p> : filtered.map((p) => <WhatsAppCard key={p.id} post={p} />)}
    </div>
  );
}
