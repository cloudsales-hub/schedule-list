import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import './ui/scrollbar.css';
import { ItemsStore } from './core/store';
import { getHotkeyError, getSettings, onHotkeyFailed, onSettingsChanged, raiseWidget, showWindow, tauriBackend } from './ui/api';
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
      onRaise={raiseWidget}
      onOpenQuick={() => void showWindow('quick')}
      onOpenDashboard={() => void showWindow('dashboard')}
    />
  );
}

document.body.style.margin = '0';
document.body.style.background = 'transparent';
createRoot(document.getElementById('root')!).render(<App />);

// 위젯 창 높이를 내용에 맞춘다. 비어 있으면 작게, 항목이 늘면 같이 커진다.
const rootEl = document.getElementById('root')!;
let lastHeight = 0;
new ResizeObserver(async () => {
  const height = Math.ceil(rootEl.getBoundingClientRect().height);
  if (height < 80 || height === lastHeight) return;
  lastHeight = height;
  try {
    const win = getCurrentWindow();
    const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    await win.setSize(new LogicalSize(Math.round(inner.width / scale), height));
  } catch {
    // 창 크기를 못 바꿔도 위젯 사용에는 지장이 없다.
  }
}).observe(rootEl);
