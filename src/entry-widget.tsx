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
      onOpenSettings={() => void showWindow('settings')}
    />
  );
}

document.body.style.margin = '0';
document.body.style.background = 'transparent';
createRoot(document.getElementById('root')!).render(<App />);

// 위젯 창 높이: 기본은 내용에 딱 맞게, 사용자가 줄여 두면 그 높이를 지키고 목록은 스크롤로 본다.
const PREF_KEY = 'widgetHeightPref';
const rootEl = document.getElementById('root')!;
const scrollEl = () => document.querySelector<HTMLElement>('[data-testid="scroll-area"]');
const win = getCurrentWindow();
const logicalSize = async () => {
  const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
  return { width: Math.round(inner.width / scale), height: Math.round(inner.height / scale) };
};
let lastSet = 0;
const { fit, userResized } = createAutoHeight({
  // 창 높이와 무관하게, 내용이 다 보이려면 필요한 높이
  measureNatural: () => {
    const sc = scrollEl();
    const top = rootEl.firstElementChild as HTMLElement | null;
    if (!sc || !top) return 0;
    return top.getBoundingClientRect().height - sc.clientHeight + sc.scrollHeight;
  },
  screenMax: () => Math.max(300, window.screen.availHeight - 40),
  getHeight: async () => (await logicalSize()).height,
  setHeight: async (height) => {
    lastSet = height;
    await win.setSize(new LogicalSize((await logicalSize()).width, height));
  },
  setMaxHeight: async (height) => {
    const { width } = await logicalSize();
    // 가로 크기는 고정하고 세로만 늘리고 줄일 수 있게 한다.
    await win.setMinSize(new LogicalSize(width, 180));
    await win.setMaxSize(new LogicalSize(width, height));
  },
  loadPref: () => {
    try {
      const v = Number(localStorage.getItem(PREF_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  },
  savePref: (pref) => {
    try {
      if (pref === null) localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, String(pref));
    } catch {
      // 기억하지 못해도 위젯 사용에는 지장이 없다.
    }
  },
});
// 내용(맨 위 줄, 목록)이 바뀔 때만 다시 맞춘다. 창 자체의 크기 변화는 사용자가 끄는 중일 수 있어 따로 처리한다.
// 화면이 그려진 뒤에야 이 칸들이 생기므로, 나타날 때까지 기다렸다가 지켜본다.
const observeContent = () => {
  const els = ['widget-top', 'widget-content'].map((id) => document.querySelector(`[data-testid="${id}"]`));
  if (els.some((el) => !el)) {
    requestAnimationFrame(observeContent);
    return;
  }
  for (const el of els) new ResizeObserver(() => void fit()).observe(el!);
  void fit();
};
observeContent();
// 사용자가 창 가장자리를 끌어 높이를 바꾼 경우(우리가 맞춘 높이가 아닌 경우)만 기억한다.
void win.onResized(async () => {
  const { height } = await logicalSize();
  if (Math.abs(height - lastSet) > 1) {
    lastSet = height;
    void userResized(height);
  }
});
// 시작할 때 저장돼 있던 창 크기가 뒤늦게 적용돼도 내용에 다시 맞춘다.
window.addEventListener('load', () => void fit());
setTimeout(() => void fit(), 500);
setTimeout(() => void fit(), 1500);
