/** 화면에 보이는 표기. 'Super+J' → 'Win+J', 'Alt+Backquote' → 'Alt+~' */
export function formatHotkey(tauriKey: string): string {
  return tauriKey
    .split('+')
    .map((p) => (p === 'Super' ? 'Win' : p === 'Backquote' ? '~' : p))
    .join('+');
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;
/** 윈도우 자체가 쓰는 Win 조합. 등록해도 우리 앱에 오지 않는다. */
const WINDOWS_RESERVED = new Set(['D', 'E', 'L', 'M', 'R', 'Tab', 'J']);

export type CaptureResult =
  | { kind: 'ignore' }
  | { kind: 'reject'; message: string }
  | { kind: 'ok'; hotkey: string };

/** 키 이름을 Tauri 표기로. 알 수 없는 키는 null. */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named = ['Backquote', 'Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'Space', 'Tab'];
  return named.includes(code) ? code : null;
}

/** 단축키 입력칸에서 눌린 키를 단축키로 해석한다. 보조키가 하나 이상 있는 조합만 허용한다. */
export function captureHotkey(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): CaptureResult {
  if (MODIFIER_CODES.test(e.code)) return { kind: 'ignore' };
  const key = keyName(e.code);
  if (!key) return { kind: 'reject', message: '이 키는 단축키로 쓸 수 없습니다. 다른 키를 눌러 주세요.' };
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[];
  if (mods.length === 0) return { kind: 'reject', message: '두 키 이상을 함께 눌러 주세요. 예: Alt+Z' };
  if (e.metaKey && WINDOWS_RESERVED.has(key)) {
    return { kind: 'reject', message: '윈도우에서 이미 쓰는 조합입니다. 다른 키를 골라 주세요.' };
  }
  return { kind: 'ok', hotkey: [...mods, key].join('+') };
}
