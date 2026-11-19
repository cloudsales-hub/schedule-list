import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ItemsStore } from '../core/store';
import { MemoInput } from './MemoInput';

const NOW = new Date('2026-11-20T09:00');

function setup(props: { onDone?: () => void } = {}) {
  const add = vi.fn().mockResolvedValue(undefined);
  const store = { add } as unknown as ItemsStore;
  const user = userEvent.setup();
  render(<MemoInput store={store} now={() => NOW} onDone={props.onDone} />);
  const input = screen.getByRole('textbox');
  return { add, user, input };
}

describe('MemoInput', () => {
  test('시간이 있는 입력은 일정으로 미리보기하고 Enter로 저장한다', async () => {
    const onDone = vi.fn();
    const { add, user, input } = setup({ onDone });
    await user.type(input, '내일 3시 회의');
    expect(screen.getByText(/일정/)).toBeInTheDocument();
    expect(screen.getByText(/내일\(11\/21\) 오후/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({ text: '내일 3시 회의', kind: 'event', due: '2026-11-21T15:00', hasTime: true });
    expect(input).toHaveValue('');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('Tab을 누르면 할일로 바뀌어 저장된다', async () => {
    const { add, user, input } = setup();
    await user.type(input, '내일 3시 회의');
    await user.keyboard('{Tab}');
    expect(screen.getByText(/할일/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledWith({ text: '내일 3시 회의', kind: 'task', due: '2026-11-21T15:00', hasTime: true });
  });

  test('날짜가 없는 입력은 마감 없는 할일이다', async () => {
    const { add, user, input } = setup();
    await user.type(input, '김 팀장 전화 회신');
    await user.keyboard('{Enter}');
    expect(add).toHaveBeenCalledWith({ text: '김 팀장 전화 회신', kind: 'task', due: null, hasTime: false });
  });

  test('빈 입력과 공백만 있는 입력은 저장하지 않는다', async () => {
    const { add, user, input } = setup();
    await user.click(input);
    await user.keyboard('{Enter}');
    await user.type(input, '   ');
    await user.keyboard('{Enter}');
    expect(add).not.toHaveBeenCalled();
  });

  test('Esc는 저장하지 않고 닫기만 한다', async () => {
    const onDone = vi.fn();
    const { add, user, input } = setup({ onDone });
    await user.type(input, '내일 회의');
    await user.keyboard('{Escape}');
    expect(add).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
