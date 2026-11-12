import { useState } from 'react';
import { applicationsRepo } from '@shared/storage';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '@shared/types';
import { newId } from '@shared/utils/log';
import { download, formatDate, stamp } from '../lib/export';
import { useDebounced, useRepository } from '../lib/hooks';
import { companyFromUrl } from '../lib/tabs';

export function LogPage() {
  const { items } = useRepository(applicationsRepo);
  const [url, setUrl] = useState('');
  const [company, setCompany] = useState('');

  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const add = async () => {
    if (!url.trim()) return;
    const now = new Date().toISOString();
    await applicationsRepo.put({
      id: newId('app'),
      company: company.trim() || companyFromUrl(url.trim()),
      url: url.trim(),
      source: 'manual',
      status: 'applied',
      createdAt: now,
      updatedAt: now,
    });
    setUrl('');
    setCompany('');
  };

  return (
    <div>
      <h2>Applications</h2>
      <div className="row">
        <input className="grow" type="url" placeholder="Job URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="grow" type="text" placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
        <button onClick={() => void add()}>Add</button>
        <button onClick={() => download(`applications-${stamp()}.json`, JSON.stringify(sorted, null, 2), 'application/json')} disabled={!items.length}>
          Export
        </button>
      </div>
      {sorted.length === 0 ? <p className="muted">Nothing logged yet. Running autofill records the application here.</p> : sorted.map((a) => <Row key={a.id} app={a} />)}
    </div>
  );
}

function Row({ app }: { app: Application }) {
  const [notes, setNotes] = useState(app.notes ?? '');
  const save = (patch: Partial<Application>) => void applicationsRepo.put({ ...app, ...patch, updatedAt: new Date().toISOString() });
  const saveNotes = useDebounced((value: string) => save({ notes: value }), 500);

  return (
    <div className="card">
      <div className="title">
        <a href={app.url} target="_blank" rel="noreferrer">
          {app.company}
        </a>
      </div>
      {app.title && <div className="small">{app.title}</div>}
      <div className="muted small">
        {app.ats ?? app.source} · {formatDate(app.createdAt)}
      </div>
      <div className="row">
        <select value={app.status} onChange={(e) => save({ status: e.target.value as ApplicationStatus })} style={{ width: 'auto' }}>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete ${app.company}?`)) void applicationsRepo.remove(app.id);
          }}
        >
          Delete
        </button>
      </div>
      <textarea
        rows={1}
        placeholder="Notes"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          saveNotes(e.target.value);
        }}
      />
    </div>
  );
}
