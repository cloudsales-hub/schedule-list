import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Settings } from './api';
import { SettingsPanel, formatHotkey } from './SettingsPanel';

const base: Settings = {
  hotkey: 'Alt+Backquote',
  dataDir: 'C:\\Users\\me\\OneDrive\\일정위젯',
  autostart: true,
};

function setup(over: Partial<Settings> = {}, props: { hotkeyError?: string | null; folder?: string | null} = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onPickFolder = vi.fn().mockResolvedValue(props.folder ?? null);
  const settings = { ...base, ...over };
  render(
    <SettingsPanel
      settings={settings}
      onSave={onSave}
      onPickFolder={onPickFolder}
      hotkeyError={props.hotkeyError ?? null}
    />,
  );
  return { onSave, onPickFolder, settings };
}

describe('formatHotkey', () => {
  test('화면용 표기로 바꾼다', () => {
    expect(formatHotkey('Super+J')).toBe('Win+J');
    expect(formatHotkey('Alt+Backquote')).toBe('Alt+~');
    expect(formatHotkey('Ctrl+Shift+Z')).toBe('Ctrl+Shift+Z');
  });
});

describe('SettingsPanel', () => {
  test('키 조합을 누르면 단축키가 바뀐다', () => {
    const { onSave, settings } = setup();
    const box = screen.getByLabelText('단축키');
    expect(box).toHaveValue('Alt+~');
    fireEvent.keyDown(box, { key: 'z', code: 'KeyZ', altKey: true });
    expect(onSave).toHaveBeenCalledWith({ ...settings, hotkey: 'Alt+Z' });
  });

  test('Ctrl+Shift 조합은 Ctrl+Shift+Z로 저장된다', () => {
    const { onSave, settings } = setup();
    fireEvent.keyDown(screen.getByLabelText('단축키'), { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(onSave).toHaveBeenCalledWith({ ...settings, hotkey: 'Ctrl+Shift+Z' });
  });

  test('키 하나만 누르면 저장하지 않고 안내한다', () => {
    const { onSave } = setup();
    fireEvent.keyDown(screen.getByLabelText('단축키'), { key: 'j', code: 'KeyJ' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/두 키 이상/)).toBeInTheDocument();
  });

  test('Alt 같은 보조키만 눌렀을 때는 아무 일도 없다', () => {
    const { onSave } = setup();
    fireEvent.keyDown(screen.getByLabelText('단축키'), { key: 'Alt', code: 'AltLeft', altKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText(/두 키 이상/)).toBeNull();
  });

  test('윈도우가 이미 쓰는 Win+M은 저장하지 않는다', () => {
    const { onSave } = setup();
    fireEvent.keyDown(screen.getByLabelText('단축키'), { key: 'm', code: 'KeyM', metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/윈도우에서 이미 쓰는/)).toBeInTheDocument();
  });

  test('Win+J도 윈도우가 쓰는 조합이라 저장하지 않는다', () => {
    const { onSave } = setup({ hotkey: 'Alt+Z' });
    fireEvent.keyDown(screen.getByLabelText('단축키'), { key: 'j', code: 'KeyJ', metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/윈도우에서 이미 쓰는/)).toBeInTheDocument();
  });

  test('단축키 등록 실패 문구를 보여 준다', () => {
    setup({}, { hotkeyError: '이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요' });
    expect(screen.getByText(/이미 사용 중인 키입니다/)).toBeInTheDocument();
  });

  test('데이터 폴더를 고른다', async () => {
    const { onSave, settings } = setup({}, { folder: 'D:\\Sync\\일정' });
    expect(screen.getByText(base.dataDir!)).toBeInTheDocument();
    expect(screen.getByText(/OneDrive/, { selector: 'p' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '폴더 선택' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...settings, dataDir: 'D:\\Sync\\일정' }));
  });

  test('대시보드와 함께 없어진 배너 설정은 보이지 않는다', () => {
    setup();
    expect(screen.queryByText('배너')).toBeNull();
    expect(screen.queryByRole('button', { name: /배너/ })).toBeNull();
  });

  test('자동 실행을 끈다', async () => {
    const { onSave, settings } = setup();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /윈도우 시작 시 자동 실행/ }));
    expect(onSave).toHaveBeenCalledWith({ ...settings, autostart: false });
  });
});
