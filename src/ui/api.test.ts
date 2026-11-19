import { beforeEach, describe, expect, test, vi } from 'vitest';

const invoke = vi.fn();
let eventHandler: (() => void) | null = null;
const unlisten = vi.fn();
let resolveListen: (() => void) | null = null;

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, cb: () => void) =>
    new Promise<() => void>((resolve) => {
      expect(name).toBe('data-changed');
      eventHandler = cb;
      resolveListen = () => resolve(unlisten);
    }),
}));

import { getSettings, saveSettings, tauriBackend, type Settings } from './api';

beforeEach(() => {
  invoke.mockReset();
  unlisten.mockReset();
  eventHandler = null;
  resolveListen = null;
});

describe('tauriBackend', () => {
  test('read는 read_data를 부르고 결과를 그대로 돌려준다', async () => {
    invoke.mockResolvedValue('내용');
    expect(await tauriBackend().read()).toBe('내용');
    expect(invoke).toHaveBeenCalledWith('read_data');
  });

  test('write는 write_data에 text를 넘긴다', async () => {
    invoke.mockResolvedValue(undefined);
    await tauriBackend().write('abc');
    expect(invoke).toHaveBeenCalledWith('write_data', { text: 'abc' });
  });

  test('backupCorrupt는 backup_corrupt_data를 부른다', async () => {
    invoke.mockResolvedValue('백업경로');
    await tauriBackend().backupCorrupt();
    expect(invoke).toHaveBeenCalledWith('backup_corrupt_data');
  });

  test('onChanged: data-changed 이벤트가 오면 콜백을 부르고, 해제하면 구독이 풀린다', async () => {
    const cb = vi.fn();
    const off = tauriBackend().onChanged(cb);
    resolveListen!();
    await Promise.resolve();
    eventHandler!();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  test('onChanged: 구독이 준비되기 전에 해제해도 준비되는 즉시 구독이 풀린다', async () => {
    const off = tauriBackend().onChanged(() => {});
    off();
    resolveListen!();
    await Promise.resolve();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe('설정', () => {
  const settings: Settings = {
    hotkey: 'Super+J',
    dataDir: null,
    autostart: true,
    bannerPath: null,
    bannerHeight: 320,
  };

  test('getSettings는 get_settings를 부른다', async () => {
    invoke.mockResolvedValue(settings);
    expect(await getSettings()).toEqual(settings);
    expect(invoke).toHaveBeenCalledWith('get_settings');
  });

  test('saveSettings는 save_settings에 settings를 넘긴다', async () => {
    invoke.mockResolvedValue(undefined);
    await saveSettings(settings);
    expect(invoke).toHaveBeenCalledWith('save_settings', { settings });
  });
});
