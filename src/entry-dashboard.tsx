import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/scrollbar.css';
import { ItemsStore } from './core/store';
import {
  getHotkeyError,
  getSettings,
  onHotkeyFailed,
  pickFolder,
  pickImage,
  saveSettings,
  suggestedDataDir,
  tauriBackend,
  type Settings,
} from './ui/api';
import { Dashboard } from './ui/Dashboard';
import { SettingsPanel } from './ui/SettingsPanel';
import { color } from './ui/styles';

const DEFAULT_SETTINGS: Settings = { hotkey: 'Super+J', dataDir: null, autostart: true, bannerPath: null, bannerHeight: 320 };

function App() {
  const store = useMemo(() => new ItemsStore(tauriBackend()), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  useEffect(() => {
    void store.load();
    // 첫 실행: 데이터 폴더가 비어 있고 OneDrive가 있으면 설정을 먼저 열고 그 폴더를 채워 둔다.
    Promise.all([getSettings(), suggestedDataDir()]).then(
      ([s, suggested]) => {
        if (!s.dataDir && suggested) {
          // 처음 한 번만 설정을 먼저 보여 주고, 추천 폴더를 바로 저장해서 다음부터는 열리지 않게 한다.
          const filled = { ...s, dataDir: suggested };
          setSettings(filled);
          setShowSettings(true);
          void saveSettings(filled).then(() => store.load(), () => {});
        } else {
          setSettings(s);
        }
      },
      () => {},
    );
    getHotkeyError().then(setHotkeyError, () => {});
    const off = onHotkeyFailed(setHotkeyError);
    return () => {
      store.dispose();
      off();
    };
  }, [store]);

  const onSave = useCallback(async (next: Settings) => {
    await saveSettings(next);
    // Rust가 단축키 등록 실패 시 이전 키로 되돌렸을 수 있으므로 저장된 값을 다시 읽는다.
    setSettings(await getSettings());
    setHotkeyError(await getHotkeyError());
    await store.load();
  }, [store]);

  const panel = showSettings ? (
    <div>
      <SettingsPanel settings={settings} onSave={onSave} onPickFolder={pickFolder} onPickImage={pickImage} hotkeyError={hotkeyError} />
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => setShowSettings(false)}
          style={{ background: color.blue, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          닫기
        </button>
      </div>
    </div>
  ) : null;

  return <Dashboard store={store} settings={settings} onOpenSettings={() => setShowSettings(true)} overlay={panel} />;
}

document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(<App />);
