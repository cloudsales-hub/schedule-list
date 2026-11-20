import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import './ui/scrollbar.css';
import { ItemsStore } from './core/store';
import { getHotkeyError, getSettings, onHotkeyFailed, onSettingsChanged, raiseWidget, showWindow, tauriBackend } from './ui/api';
import { formatHotkey } from './ui/hotkey';
import { createAutoHeight } from './ui/autoHeight';
import { Widget } from './ui/Widget';

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [hotkey, setHotkey] = useState('Alt+~');
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
const fit = createAutoHeight({
  measure: () => rootEl.getBoundingClientRect().height,
  getHeight: async () => {
    const win = getCurrentWindow();
    const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    return Math.round(inner.height / scale);
  },
  setHeight: async (height) => {
    const win = getCurrentWindow();
    const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    await win.setSize(new LogicalSize(Math.round(inner.width / scale), height));
  },
});
new ResizeObserver(() => void fit()).observe(rootEl);
// 시작할 때 저장돼 있던 창 크기가 뒤늦게 적용돼도 내용에 다시 맞춘다.
window.addEventListener('load', () => void fit());
setTimeout(() => void fit(), 500);
setTimeout(() => void fit(), 1500);
