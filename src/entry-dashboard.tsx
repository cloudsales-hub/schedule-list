import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemsStore } from './core/store';
import { getSettings, tauriBackend, type Settings } from './ui/api';
import { Dashboard } from './ui/Dashboard';

const DEFAULT_SETTINGS: Settings = { hotkey: 'Super+J', dataDir: null, autostart: true, bannerPath: null, bannerHeight: 320 };

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void store.load();
    getSettings().then(setSettings, () => {});
    return () => store.dispose();
  }, [store]);

  // Task 10에서 설정 화면이 연결된다.
  return <Dashboard store={store} settings={settings} onOpenSettings={() => {}} />;
}

document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(<App />);
