import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ItemsStore } from '../core/store';
import { QuickInput } from './QuickInput';

const NOW = new Date('2026-11-20T09:00');

function setup() {
  const add = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const store = { add } as unknown as ItemsStore;
  const user = userEvent.setup();
  render(<QuickInput store={store} now={() => NOW} onClose={onClose} />);
  return { add, onClose, user, input: screen.getByRole('textbox') };
}

describe('QuickInput', () => {
  test('열리면 입력칸에 포커스가 있다', () => {
    const { input } = setup();
    expect(input).toHaveFocus();
  });

  test('입력하면 인식 결과를 미리 보여 주고 Enter로 저장한 뒤 닫는다', async () => {
    const { add, onClose, user, input } = setup();
    await user.type(input, '내일 3시 회의');
    expect(screen.getByText(/일정/)).toBeInTheDocument();
    expect(screen.getByText(/내일\(11\/21\) 오후/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({ text: '내일 3시 회의', kind: 'event', due: '2026-11-21T15:00', hasTime: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('마감이 있는 할일과 없는 할일의 미리보기가 다르다', async () => {
    const { user, input } = setup();
    await user.type(input, '내일 오전까지 견적서');
    expect(screen.getByText(/인식됨 → 🔥 할일 · 마감 내일\(11\/21\) 오전/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '전화 회신');
    expect(screen.getByText(/📝 할일 \(마감 없음\)/)).toBeInTheDocument();
  });

  test('Tab으로 할일로 바꿔 저장한다', async () => {
    const { add, user, input } = setup();
    await user.type(input, '내일 3시 회의');
    await user.keyboard('{Tab}');
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledWith({ text: '내일 3시 회의', kind: 'task', due: '2026-11-21T15:00', hasTime: true });
  });

  test('날짜가 없는 입력은 마감 없는 할일이다', async () => {
    const { add, user, input } = setup();
    await user.type(input, '김 팀장 전화 회신');
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledWith({ text: '김 팀장 전화 회신', kind: 'task', due: null, hasTime: false });
  });

  test('빈 입력과 공백만 있는 입력의 Enter는 저장 없이 닫는다', async () => {
    const { add, onClose, user, input } = setup();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.type(input, '   ');
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(add).not.toHaveBeenCalled();
  });

  test('Esc는 아무것도 저장하지 않고 닫는다', async () => {
    const { add, onClose, user, input } = setup();
    await user.type(input, '내일 회의');
    await user.keyboard('{Escape}');
    expect(add).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
