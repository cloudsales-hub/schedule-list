import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemsStore } from './core/store';
import { getHotkeyError, getSettings, onHotkeyFailed, onSettingsChanged, showWindow, tauriBackend } from './ui/api';
import { formatHotkey } from './ui/hotkey';
import { Widget } from './ui/Widget';

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [hotkey, setHotkey] = useState('Win+J');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void store.load();
    const refresh = () => getSettings().then((s) => setHotkey(formatHotkey(s.hotkey)), () => {});
    void refresh();
    const offSettings = onSettingsChanged(() => {
      void refresh();
      getHotkeyError().then(setNotice, () => {});
    });
    getHotkeyError().then(setNotice, () => {});
    const off = onHotkeyFailed(setNotice);
    return () => {
      store.dispose();
      off();
      offSettings();
    };
  }, [store]);

  return (
    <Widget
      store={store}
      hotkeyLabel={hotkey}
      notice={notice}
      onOpenQuick={() => void showWindow('quick')}
      onOpenDashboard={() => void showWindow('dashboard')}
    />
  );
}

document.body.style.margin = '0';
document.body.style.background = 'transparent';
createRoot(document.getElementById('root')!).render(<App />);
