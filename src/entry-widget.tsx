import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemsStore } from './core/store';
import { getSettings, showWindow, tauriBackend } from './ui/api';
import { Widget } from './ui/Widget';

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [hotkey, setHotkey] = useState('Win+J');

  useEffect(() => {
    void store.load();
    // Task 10에서 formatHotkey로 교체된다.
    getSettings().then((s) => setHotkey(s.hotkey.replace('Super', 'Win')), () => {});
    return () => store.dispose();
  }, [store]);

  return (
    <Widget
      store={store}
      hotkeyLabel={hotkey}
      onOpenQuick={() => void showWindow('quick')}
      onOpenDashboard={() => void showWindow('dashboard')}
    />
  );
}

document.body.style.margin = '0';
document.body.style.background = 'transparent';
createRoot(document.getElementById('root')!).render(<App />);
