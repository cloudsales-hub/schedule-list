import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/scrollbar.css';
import { ItemsStore } from './core/store';
import { getHotkeyError, getSettings, onHotkeyFailed, pickFolder, saveSettings, tauriBackend, type Settings } from './ui/api';
import { SettingsPanel } from './ui/SettingsPanel';
import { color } from './ui/styles';

const DEFAULT_SETTINGS: Settings = { hotkey: 'Alt+Backquote', dataDir: null, autostart: true };

function App() {
  // 데이터 폴더를 바꾸면 위젯이 새 폴더의 내용을 읽도록 저장소를 다시 불러온다.
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  useEffect(() => {
    void store.load();
    getSettings().then(setSettings, () => {});
    getHotkeyError().then(setHotkeyError, () => {});
    const off = onHotkeyFailed(setHotkeyError);
    return () => {
      store.dispose();
      off();
    };
  }, [store]);

  const onSave = useCallback(
    async (next: Settings) => {
      await saveSettings(next);
      // Rust가 단축키 등록 실패 시 이전 키로 되돌렸을 수 있으므로 저장된 값을 다시 읽는다.
      setSettings(await getSettings());
      setHotkeyError(await getHotkeyError());
      await store.load();
    },
    [store],
  );

  return (
    <div style={{ minHeight: '100vh', background: color.bg }}>
      <SettingsPanel settings={settings} onSave={onSave} onPickFolder={pickFolder} hotkeyError={hotkeyError} />
    </div>
  );
}

document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(<App />);
