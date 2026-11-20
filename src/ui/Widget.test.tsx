import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '../core/model';
import type { ItemsStore } from '../core/store';
import { Widget } from './Widget';

const NOW = new Date('2026-11-20T09:00');
let seq = 0;
function item(p: Partial<Item>): Item {
  seq++;
  return {
    id: `i${seq}`,
    text: `항목${seq}`,
    kind: 'task',
    due: null,
    hasTime: false,
    done: false,
    deleted: false,
    createdAt: seq,
    updatedAt: seq,
    ...p,
  };
}

function fakeStore(items: Item[], extra: Partial<{ status: string; error: string | null }> = {}) {
  const store = {
    remove: vi.fn().mockResolvedValue(undefined),
    items,
    status: 'ready',
    error: null,
    subscribe: () => () => {},
    add: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    ...extra,
  };
  return store as unknown as ItemsStore & { add: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}

function setup(items: Item[], extra = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const store = fakeStore(items, extra);
  const onOpenQuick = vi.fn();
  const onOpenDashboard = vi.fn();
  render(<Widget store={store} hotkeyLabel="Win+J" onOpenQuick={onOpenQuick} onOpenDashboard={onOpenDashboard} />);
  return { store, onOpenQuick, onOpenDashboard };
}

afterEach(() => {
  vi.useRealTimers();
  seq = 0;
});

describe('Widget', () => {
  test('급한 것, 할일만 보이고 일정은 보이지 않는다', () => {
    setup([
      item({ text: '견적서', due: '2026-11-20T17:00', hasTime: true }),
      item({ text: '보고서', due: '2026-11-27T00:00' }),
      item({ text: '메일 회신' }),
      item({ text: '영수증 정리' }),
      item({ text: '책 반납' }),
      item({ text: '팀 회의', kind: 'event', due: '2026-11-21T15:00', hasTime: true }),
    ]);
    expect(screen.getByText(/급한 것/)).toBeInTheDocument();
    expect(screen.getByText(/할일 \(3\)/)).toBeInTheDocument();
    expect(screen.getByText('견적서')).toBeInTheDocument();
    expect(screen.getByText('보고서')).toBeInTheDocument();
    expect(screen.getByText('책 반납')).toBeInTheDocument();
    expect(screen.queryByText('팀 회의')).toBeNull();
  });

  test('마감 라벨을 보여 준다', () => {
    setup([
      item({ text: 'A', due: '2026-11-20T17:00', hasTime: true }),
      item({ text: 'B', due: '2026-11-21T00:00' }),
      item({ text: 'C', due: '2026-11-27T00:00' }),
    ]);
    expect(screen.getByText('오늘 17:00')).toBeInTheDocument();
    expect(screen.getByText('내일')).toBeInTheDocument();
    expect(screen.getByText('11/27')).toBeInTheDocument();
  });

  test('＋ 메모 버튼에 단축키가 보이고 누르면 빠른 입력을 연다', async () => {
    const { onOpenQuick, onOpenDashboard } = setup([]);
    const btn = screen.getByRole('button', { name: /메모/ });
    expect(btn).toHaveTextContent('Win+J');
    fireEvent.click(btn);
    expect(onOpenQuick).toHaveBeenCalledTimes(1);
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  test('체크 칸은 완료 처리만 하고 대시보드를 열지 않는다', () => {
    const it = item({ text: '견적서', due: '2026-11-20T17:00', hasTime: true });
    const { store, onOpenDashboard } = setup([it]);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(store.update).toHaveBeenCalledWith(it.id, { done: true });
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  test('삭제 버튼은 항목을 지우고 대시보드를 열지 않는다', () => {
    const it = item({ text: '잘못 적은 메모' });
    const { store, onOpenDashboard } = setup([it]);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect((store as unknown as { remove: ReturnType<typeof vi.fn> }).remove).toHaveBeenCalledWith(it.id);
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  test('항목 영역을 누르면 대시보드를 연다', () => {
    const { onOpenDashboard } = setup([item({ text: '견적서', due: '2026-11-20T17:00', hasTime: true })]);
    fireEvent.click(screen.getByText('견적서'));
    expect(onOpenDashboard).toHaveBeenCalledTimes(1);
  });

  test('윗줄(날짜)은 끌어서 옮기는 자리이고 눌러도 대시보드가 열리지 않는다', () => {
    const { onOpenDashboard } = setup([]);
    const handle = screen.getByTestId('drag-handle');
    expect(handle).toHaveAttribute('data-tauri-drag-region');
    fireEvent.click(handle);
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  test('위젯 입력칸에 쓰면 저장하고 대시보드는 열지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const store = fakeStore([]);
    const onOpenDashboard = vi.fn();
    render(<Widget store={store} hotkeyLabel="Win+J" onOpenQuick={() => {}} onOpenDashboard={onOpenDashboard} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '내일 오전까지 견적서');
    await user.keyboard('{Enter}');
    expect(store.add).toHaveBeenCalledTimes(1);
    expect(store.add).toHaveBeenCalledWith({
      text: '내일 오전까지 견적서',
      kind: 'task',
      due: '2026-11-21T12:00',
      hasTime: true,
    });
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  test('자정을 넘기면 라벨과 빨간색이 바뀐다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T23:59:30'));
    const store = fakeStore([
      item({ text: '내일마감', due: '2026-11-21T00:00' }),
      item({ text: '오늘마감', due: '2026-11-20T00:00' }),
    ]);
    render(<Widget store={store} hotkeyLabel="Win+J" onOpenQuick={() => {}} onOpenDashboard={() => {}} />);
    const row = (t: string) => screen.getByText(t).closest('[data-testid="row"]') as HTMLElement;
    expect(within(row('내일마감')).getByText('내일')).toBeInTheDocument();
    expect(within(row('오늘마감')).getByText('오늘')).toHaveAttribute('data-overdue', 'false');

    act(() => {
      vi.setSystemTime(new Date('2026-11-21T00:01:00'));
      vi.advanceTimersByTime(60_000);
    });
    expect(within(row('내일마감')).getByText('오늘')).toBeInTheDocument();
    expect(within(row('오늘마감')).getByText('11/20')).toHaveAttribute('data-overdue', 'true');
  });

  test('항목이 아주 많거나 길어도 스크롤과 말줄임으로 처리한다', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      item({ text: i === 0 ? 'ㄱ'.repeat(120) : `일${i}`, due: '2026-11-25T00:00' }),
    );
    setup(many);
    const list = screen.getByTestId('urgent-list');
    expect(list).toHaveStyle({ overflowY: 'auto' });
    expect(list.style.maxHeight).not.toBe('');
    const long = screen.getByText('ㄱ'.repeat(120));
    expect(long).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' });
  });

  test('안내 문구(notice)가 있으면 위쪽에 보여 준다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    render(
      <Widget
        store={fakeStore([])}
        hotkeyLabel="Win+J"
        notice="이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요"
        onOpenQuick={() => {}}
        onOpenDashboard={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('이미 사용 중인 키입니다');
  });

  test('저장소 오류 문구를 위쪽에 보여 준다', () => {
    setup([], { status: 'error', error: '데이터 파일을 저장하지 못했습니다: disk full' });
    expect(screen.getByRole('alert')).toHaveTextContent('데이터 파일을 저장하지 못했습니다: disk full');
  });
});
