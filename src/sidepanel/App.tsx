import { useEffect, useState } from 'react';
import { PostsPage } from './pages/PostsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AutofillPage } from './pages/AutofillPage';
import { LogPage } from './pages/LogPage';
import { SettingsPage } from './pages/SettingsPage';
import { useActiveTab } from './lib/hooks';

type Tab = 'posts' | 'autofill' | 'profile' | 'log' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'autofill', label: 'Autofill' },
  { id: 'profile', label: 'Profile' },
  { id: 'log', label: 'Log' },
  { id: 'settings', label: 'Settings' },
];

function suggestedTab(url: string | undefined): Tab | null {
  if (!url) return null;
  if (/linkedin\.com/i.test(url)) return 'posts';
  if (/greenhouse\.io|lever\.co|myworkday(jobs|site)\.com/i.test(url)) return 'autofill';
  return null;
}

export function App() {
  const activeTab = useActiveTab();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('jh.tab') as Tab) || 'posts';
    } catch {
      return 'posts';
    }
  });
  const [autoSwitched, setAutoSwitched] = useState<string | undefined>();

  // Follow the user: LinkedIn tab -> Posts, ATS tab -> Autofill. Once per URL host.
  useEffect(() => {
    const suggestion = suggestedTab(activeTab?.url);
    const host = activeTab?.url ? new URL(activeTab.url).hostname : undefined;
    if (suggestion && host && host !== autoSwitched) {
      setTab(suggestion);
      setAutoSwitched(host);
    }
  }, [activeTab?.url, autoSwitched]);

  useEffect(() => {
    try {
      localStorage.setItem('jh.tab', tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="page">
        {tab === 'posts' && <PostsPage activeTab={activeTab} />}
        {tab === 'autofill' && <AutofillPage activeTab={activeTab} />}
        {tab === 'profile' && <ProfilePage />}
        {tab === 'log' && <LogPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
