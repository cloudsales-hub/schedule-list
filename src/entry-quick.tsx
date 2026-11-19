import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ItemsStore } from './core/store';
import { tauriBackend } from './ui/api';
import { QuickInput } from './ui/QuickInput';

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  // 창이 다시 열릴 때마다 입력칸을 비우고 포커스하기 위해 새로 그린다.
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    void store.load();
    const win = getCurrentWindow();
    const hide = () => void win.hide();
    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) hide();
    });
    const unlistenOpen = listen('quick-open', () => setOpenCount((n) => n + 1));
    return () => {
      store.dispose();
      void unlistenFocus.then((u) => u());
      void unlistenOpen.then((u) => u());
    };
  }, [store]);

  return (
    <QuickInput
      key={openCount}
      store={store}
      now={() => new Date()}
      onClose={() => void getCurrentWindow().hide()}
    />
  );
}

document.body.style.margin = '0';
document.body.style.background = 'transparent';
createRoot(document.getElementById('root')!).render(<App />);
