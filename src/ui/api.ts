import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { Backend } from '../core/store';

/** 이 PC에만 저장되는 앱 설정. 이름은 src-tauri/src/settings.rs와 같다. */
export interface Settings {
  /** Tauri 표기. 예: 'Super+J' */
  hotkey: string;
  dataDir: string | null;
  autostart: boolean;
  /** null이면 기본 그림 */
  bannerPath: string | null;
  bannerHeight: 160 | 240 | 320;
}

export function tauriBackend(): Backend {
  return {
    read: () => invoke<string | null>('read_data'),
    write: async (text) => {
      await invoke('write_data', { text });
    },
    backupCorrupt: async () => {
      await invoke('backup_corrupt_data');
    },
    onChanged: (cb) => {
      // listen은 Promise를 돌려주므로, 준비되기 전에 해제해도 준비되는 즉시 풀리게 한다.
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void listen('data-changed', () => cb()).then((u) => {
        if (cancelled) u();
        else unlisten = u;
      });
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
  };
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function saveSettings(settings: Settings): Promise<void> {
  await invoke('save_settings', { settings });
}

/** 이미 만들어진 창을 앞으로 가져온다. 아직 없는 창이면 조용히 넘어간다. */
export async function showWindow(label: 'widget' | 'quick' | 'dashboard'): Promise<void> {
  try {
    await invoke('show_window', { label });
  } catch {
    // 해당 창은 이후 작업에서 추가된다.
  }
}

/** 단축키 등록에 실패했다면 그 안내 문구. 아니면 null. */
export function getHotkeyError(): Promise<string | null> {
  return invoke<string | null>('get_hotkey_error');
}

/** 단축키 등록 실패 알림을 받는다. 해제 함수를 돌려준다. */
export function onHotkeyFailed(cb: (message: string) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  void listen<string>('hotkey-failed', (e) => cb(e.payload)).then((u) => {
    if (cancelled) u();
    else unlisten = u;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** 처음 실행 때 데이터 폴더로 미리 채워 줄 OneDrive 안 폴더. 없으면 null. */
export function suggestedDataDir(): Promise<string | null> {
  return invoke<string | null>('suggested_data_dir');
}

/** 폴더 선택 창. 취소하면 null. */
export async function pickFolder(): Promise<string | null> {
  const r = await open({ directory: true, multiple: false });
  return typeof r === 'string' ? r : null;
}

/** 배너로 쓸 이미지 파일 선택 창. 취소하면 null. */
export async function pickImage(): Promise<string | null> {
  const r = await open({
    multiple: false,
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  return typeof r === 'string' ? r : null;
}

/** 설정이 저장되면 알려 준다(예: 위젯의 단축키 표시를 갱신). 해제 함수를 돌려준다. */
export function onSettingsChanged(cb: () => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  void listen('settings-changed', () => cb()).then((u) => {
    if (cancelled) u();
    else unlisten = u;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** 위젯을 맨 앞으로 올린다. 다른 창을 누르면 다시 바탕화면 쪽으로 내려간다. */
export function raiseWidget(): void {
  void invoke('raise_widget').catch(() => {});
}
