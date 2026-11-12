import { useEffect, useState } from 'react';
import { parseProfile, profileDerived } from '@profile/profile.schema';
import exampleProfile from '@profile/profile.example.json';
import { profileStore } from '@shared/storage';
import { download } from '../lib/export';
import { useValueStore } from '../lib/hooks';

/**
 * The profile is a JSON document validated by profile/profile.schema.ts.
 * Import it from a file (profile/profile.json, kept out of git) or edit the
 * JSON here. Nothing in it leaves the browser in Phase 1.
 */
export function ProfilePage() {
  const { value: profile, set, clear, loading } = useValueStore(profileStore);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (editing) setDraft(JSON.stringify(profile ?? {}, null, 2));
  }, [editing, profile]);

  const applyJson = async (raw: string, source: string) => {
    setErrors([]);
    setMessage('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      setErrors([`Invalid JSON: ${(err as Error).message}`]);
      return;
    }
    const result = parseProfile(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    await set({ ...result.profile, meta: { ...result.profile.meta, updatedAt: new Date().toISOString(), source } });
    setMessage(`Profile saved from ${source}`);
    setEditing(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await applyJson(await file.text(), file.name);
  };

  const loadExample = async () => {
    await applyJson(JSON.stringify(exampleProfile), 'profile.example.json');
  };

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <h2>Candidate profile</h2>

      {profile ? (
        <div className="card">
          <div className="title">{profileDerived.fullName(profile)}</div>
          <div className="small">
            {profile.contact.email} · {profileDerived.phoneE164(profile)}
          </div>
          <div className="small muted">{profileDerived.cityCountry(profile)}</div>
          <div className="small muted">
            {profile.experience.length} experience · {profile.education.length} education · {profile.skills.length} skills ·{' '}
            {Object.keys(profile.answers).length} answers
          </div>
          {profile.meta.source && (
            <div className="small muted">
              from {profile.meta.source}
              {profile.meta.updatedAt ? ` at ${new Date(profile.meta.updatedAt).toLocaleString()}` : ''}
            </div>
          )}
        </div>
      ) : (
        <p className="muted">No profile loaded. Import profile/profile.json or load the example to see the shape.</p>
      )}

      <div className="row">
        <label className="btn">
          Import JSON
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <button onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel edit' : 'Edit JSON'}</button>
        {profile && <button onClick={() => download('profile.json', JSON.stringify(profile, null, 2), 'application/json')}>Export</button>}
        <button onClick={() => void loadExample()}>Load example</button>
        {profile && (
          <button
            className="danger"
            onClick={() => {
              if (confirm('Remove the stored profile?')) void clear();
            }}
          >
            Clear
          </button>
        )}
      </div>

      {editing && (
        <div>
          <textarea rows={24} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          <div className="row">
            <button className="primary" onClick={() => void applyJson(draft, 'editor')}>
              Save
            </button>
          </div>
        </div>
      )}

      {message && <p className="success">{message}</p>}
      {errors.length > 0 && (
        <div className="error">
          <p>Profile rejected:</p>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Fields forms usually ask for</h3>
      <p className="muted small">
        Identity, contact, location, links, work authorization, compensation, education (most recent first), experience (most recent first),
        and an <code>answers</code> map for recurring questions such as <code>howDidYouHear</code>. See profile/profile.example.json.
      </p>
    </div>
  );
}
