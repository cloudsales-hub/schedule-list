import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Settings } from './api';
import { captureHotkey, formatHotkey } from './hotkey';
import { color, font } from './styles';

export { formatHotkey };

interface Props {
  settings: Settings;
  onSave(s: Settings): Promise<void>;
  onPickFolder(): Promise<string | null>;
  /** 단축키 등록 실패 안내. 실패하면 이전 키가 그대로 유지된다. */
  hotkeyError: string | null;
}

const button: CSSProperties = {
  background: color.card,
  color: color.text,
  border: `1px solid ${color.line}`,
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const section: CSSProperties = { marginBottom: 18 };
const heading: CSSProperties = { margin: '0 0 6px', fontSize: 13, color: color.sub };

export function SettingsPanel({ settings, onSave, onPickFolder, hotkeyError }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const save = (patch: Partial<Settings>) => onSave({ ...settings, ...patch });

  const onHotkeyKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const r = captureHotkey(e);
    if (r.kind === 'ignore') return;
    if (r.kind === 'reject') {
      setHint(r.message);
      return;
    }
    setHint(null);
    if (r.hotkey !== settings.hotkey) void save({ hotkey: r.hotkey });
  };

  return (
    <div style={{ padding: 20, color: color.text, fontFamily: font, fontSize: 13 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>설정</h2>

      <div style={section}>
        <h3 style={heading}>메모 단축키</h3>
        <input
          aria-label="단축키"
          readOnly
          value={formatHotkey(settings.hotkey)}
          onKeyDown={onHotkeyKey}
          onFocus={() => setHint('원하는 키 조합을 누르세요. 예: Alt+Z')}
          onBlur={() => setHint(null)}
          style={{ background: color.bg, color: color.text, border: `1px solid ${color.blue}`, borderRadius: 6, padding: '6px 10px', width: 160 }}
        />
        {hint && <p style={{ margin: '6px 0 0', color: color.sub }}>{hint}</p>}
        {hotkeyError && <p style={{ margin: '6px 0 0', color: color.red }}>{hotkeyError}</p>}
      </div>

      <div style={section}>
        <h3 style={heading}>데이터 폴더</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ wordBreak: 'break-all' }}>{settings.dataDir ?? '(기본 위치)'}</span>
          <button
            style={button}
            onClick={async () => {
              const dir = await onPickFolder();
              if (dir) await save({ dataDir: dir });
            }}
          >
            폴더 선택
          </button>
        </div>
        <p style={{ margin: '6px 0 0', color: color.sub }}>
          두 PC에서 같은 데이터를 쓰려면 OneDrive 안의 폴더를 고르세요. 두 PC 모두 같은 폴더를 골라야 합니다.
        </p>
      </div>

      <label>
        <input type="checkbox" checked={settings.autostart} onChange={(e) => void save({ autostart: e.target.checked })} /> 윈도우 시작 시 자동 실행
      </label>
    </div>
  );
}
