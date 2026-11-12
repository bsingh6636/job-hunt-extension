import { useEffect, useState } from 'react';
import { applicationsRepo, fillReportsRepo, getSettings, profileStore, settingsStore } from '@shared/storage';
import type { FillReport, FillResult } from '@shared/types';
import { newId } from '@shared/utils/log';
import { useValueStore } from '../lib/hooks';
import { askTab, companyFromUrl, isAtsUrl } from '../lib/tabs';

interface Props {
  activeTab: chrome.tabs.Tab | undefined;
}

export function AutofillPage({ activeTab }: Props) {
  const { value: profile } = useValueStore(profileStore);
  const { value: settings, set: setSettings } = useValueStore(settingsStore);
  const [detected, setDetected] = useState<{ adapter: string | null; fieldsOnPage: number } | null>(null);
  const [report, setReport] = useState<FillReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const url = activeTab?.url;
  const onAts = isAtsUrl(url);

  useEffect(() => {
    setDetected(null);
    setReport(null);
    setError('');
    if (!onAts || !activeTab?.id) return;
    const id = activeTab.id;
    void askTab(id, 'AUTOFILL_DETECT', {})
      .then(setDetected)
      .catch((err: Error) => setError(err.message));
  }, [url, onAts, activeTab?.id]);

  const fill = async () => {
    if (!activeTab?.id || !profile || !url) return;
    setBusy(true);
    setError('');
    try {
      const { autofill } = await getSettings();
      const result = await askTab(activeTab.id, 'AUTOFILL_RUN', { profile, ...autofill });
      setReport(result);
      await fillReportsRepo.put({ ...result, id: newId('fill') });
      await recordApplication(url, result.adapter, activeTab.title);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (key: 'fillEmptyOnly' | 'highlight', value: boolean) => {
    const current = await getSettings();
    await setSettings({ ...current, autofill: { ...current.autofill, [key]: value } });
  };

  return (
    <div>
      <h2>Autofill</h2>
      {!onAts ? (
        <p className="muted">Open a Greenhouse, Lever or Workday application page. Supported hosts are listed in manifest.config.ts.</p>
      ) : (
        <div className="status-bar">
          {detected ? (
            detected.adapter ? (
              <span>
                Detected <b>{detected.adapter}</b> · {detected.fieldsOnPage} known field(s) visible on this step
              </span>
            ) : (
              <span className="error">No adapter matched this page.</span>
            )
          ) : (
            <span className="muted">Detecting...</span>
          )}
        </div>
      )}

      {!profile && <p className="error">Load a profile on the Profile tab first.</p>}

      <label className="check">
        <input type="checkbox" checked={settings?.autofill.fillEmptyOnly ?? true} onChange={(e) => void toggle('fillEmptyOnly', e.target.checked)} />
        only fill empty fields
      </label>
      <label className="check">
        <input type="checkbox" checked={settings?.autofill.highlight ?? true} onChange={(e) => void toggle('highlight', e.target.checked)} />
        highlight filled fields
      </label>

      <div className="row">
        <button className="primary" disabled={!onAts || !profile || !detected?.adapter || busy} onClick={() => void fill()}>
          {busy ? 'Filling...' : 'Fill this page'}
        </button>
        <span className="muted small">Workday: run once per step. Review every field before submitting.</span>
      </div>
      {error && <p className="error">{error}</p>}

      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }: { report: FillReport }) {
  const list = (items: FillResult[], showValue: boolean) => (
    <ul>
      {items.map((r) => (
        <li key={r.key}>
          {r.label}
          {showValue && r.value !== undefined ? `: ${r.value}` : ''}
          {r.reason ? <span className="muted"> ({r.reason})</span> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="report">
      <h3>
        Filled {report.filled.length} · skipped {report.skipped.length} · not on page {report.unmatched.length}
      </h3>
      {report.filled.length > 0 && (
        <details open>
          <summary>Filled</summary>
          {list(report.filled, true)}
        </details>
      )}
      {report.skipped.length > 0 && (
        <details open>
          <summary>Skipped</summary>
          {list(report.skipped, true)}
        </details>
      )}
      {report.unmatched.length > 0 && (
        <details>
          <summary>Not found on this page</summary>
          {list(report.unmatched, false)}
        </details>
      )}
      {report.unknownFields.length > 0 && (
        <details>
          <summary>{report.unknownFields.length} field(s) on the page the adapter does not know (AI matching input)</summary>
          <ul>
            {report.unknownFields.map((f, i) => (
              <li key={i}>
                {f.label} <span className="muted small">({f.tag}{f.type ? `/${f.type}` : ''}{f.automationId ? ` ${f.automationId}` : ''})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

async function recordApplication(url: string, ats: string, title: string | undefined) {
  const existing = (await applicationsRepo.list()).find((a) => a.url === url);
  const now = new Date().toISOString();
  if (existing) {
    await applicationsRepo.put({ ...existing, updatedAt: now });
    return;
  }
  await applicationsRepo.put({
    id: newId('app'),
    company: companyFromUrl(url),
    title: title?.replace(/\s*[|\-–]\s*(Greenhouse|Lever|Workday).*$/i, '').trim(),
    url,
    ats,
    source: 'autofill',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });
}
