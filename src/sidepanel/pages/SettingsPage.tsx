import { useEffect, useState } from 'react';
import { rematchAllPosts } from '@shared/posts';
import { checkServer, getSettings, settingsStore } from '@shared/storage';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';
import { parseKeywordList } from '@shared/utils/keywords';

/**
 * Keyword filters and extraction options. Keywords are matched
 * case-insensitively as phrases against post text + author headline.
 * Saving re-tags every stored post.
 */
export function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [message, setMessage] = useState('');
  const [serverMsg, setServerMsg] = useState('');
  const [serverOk, setServerOk] = useState(false);

  const testServer = async () => {
    if (!form) return;
    try {
      const health = await checkServer(form.storage.serverUrl);
      setServerOk(true);
      setServerMsg(`OK. ${health.db}. ${Object.entries(health.counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'empty'}`);
    } catch (err) {
      setServerOk(false);
      setServerMsg((err as Error).message);
    }
  };

  useEffect(() => {
    void getSettings().then((s) => {
      setForm(s);
      setInclude(s.keywords.include.join('\n'));
      setExclude(s.keywords.exclude.join('\n'));
    });
  }, []);

  if (!form) return <p className="muted">Loading...</p>;

  const save = async () => {
    const next: Settings = {
      ...form,
      keywords: { include: parseKeywordList(include), exclude: parseKeywordList(exclude) },
    };
    await settingsStore.set(next);
    const count = await rematchAllPosts();
    setMessage(`Saved. Re-tagged ${count} stored post(s).`);
    setTimeout(() => setMessage(''), 3000);
  };

  const reset = () => {
    setForm(DEFAULT_SETTINGS);
    setInclude(DEFAULT_SETTINGS.keywords.include.join('\n'));
    setExclude(DEFAULT_SETTINGS.keywords.exclude.join('\n'));
  };

  const num = (key: keyof Settings['extract'], value: string) =>
    setForm({ ...form, extract: { ...form.extract, [key]: Math.max(1, Number(value) || 0) } });

  return (
    <div>
      <h2>Settings</h2>

      <h3>Keyword filters</h3>
      <label className="field">
        <span>Include keywords (one per line or comma-separated). Posts are tagged with every hit.</span>
        <textarea rows={6} value={include} onChange={(e) => setInclude(e.target.value)} />
      </label>
      <label className="field">
        <span>Exclude keywords. Matching posts are kept but hidden by default.</span>
        <textarea rows={3} value={exclude} onChange={(e) => setExclude(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.captureOnlyMatching} onChange={(e) => setForm({ ...form, captureOnlyMatching: e.target.checked })} />
        store only posts that hit an include keyword (default: store everything, filter later)
      </label>

      <h3>Extraction</h3>
      <label className="field">
        <span>Posts to capture per Extract (also editable on the Posts tab)</span>
        <input type="number" min={1} value={form.extract.maxPosts} onChange={(e) => num('maxPosts', e.target.value)} />
      </label>
      <label className="field">
        <span>Posts to capture per More press</span>
        <input type="number" min={1} value={form.extract.moreBatch} onChange={(e) => num('moreBatch', e.target.value)} />
      </label>
      <div className="row">
        <label className="field">
          <span>Pause between scrolls, at least (seconds)</span>
          <input type="number" min={0.5} step={0.5} value={form.extract.pauseMinMs / 1000} onChange={(e) => num('pauseMinMs', String(Number(e.target.value) * 1000))} />
        </label>
        <label className="field">
          <span>at most (seconds). A random time in between is used each scroll</span>
          <input type="number" min={0.5} step={0.5} value={form.extract.pauseMaxMs / 1000} onChange={(e) => num('pauseMaxMs', String(Number(e.target.value) * 1000))} />
        </label>
      </div>
      <label className="field">
        <span>Wait for new posts after each scroll, at most (ms)</span>
        <input type="number" min={300} step={100} value={form.extract.scrollDelayMs} onChange={(e) => num('scrollDelayMs', e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.extract.scroll} onChange={(e) => setForm({ ...form, extract: { ...form.extract, scroll: e.target.checked } })} />
        scroll to load more posts
      </label>
      <label className="check">
        <input type="checkbox" checked={form.extract.expand} onChange={(e) => setForm({ ...form, extract: { ...form.extract, expand: e.target.checked } })} />
        click "...more" to expand posts
      </label>

      <div className="row">
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
        <button onClick={reset}>Reset to defaults</button>
        {message && <span className="success small">{message}</span>}
      </div>

      <h3>Storage</h3>
      <label className="check">
        <input type="radio" name="storage" checked={form.storage.mode === 'server'} onChange={() => setForm({ ...form, storage: { ...form.storage, mode: 'server' } })} />
        SQLite file on this laptop via the local server (run <code>npm run server</code>)
      </label>
      <label className="check">
        <input type="radio" name="storage" checked={form.storage.mode === 'browser'} onChange={() => setForm({ ...form, storage: { ...form.storage, mode: 'browser' } })} />
        inside this browser (chrome.storage.local)
      </label>
      {form.storage.mode === 'server' && (
        <label className="field">
          <span>Server URL</span>
          <input type="url" value={form.storage.serverUrl} onChange={(e) => setForm({ ...form, storage: { ...form.storage, serverUrl: e.target.value } })} />
        </label>
      )}
      <div className="row">
        <button onClick={() => void testServer()}>Test connection</button>
        {serverMsg && <span className={serverOk ? 'success small' : 'error small'}>{serverMsg}</span>}
      </div>
      <p className="muted small">
        Posts, applications and fill reports go to the selected storage. Profile and these settings always stay in the browser. Switching the
        mode does not move data that is already stored, so pick one mode and keep it.
      </p>
    </div>
  );
}
