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

function setup(items: Item[], extra = {}, onRaise: () => void = () => {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const store = fakeStore(items, extra);
  const onOpenQuick = vi.fn();
  const onOpenSettings = vi.fn();
  render(<Widget store={store} hotkeyLabel="Alt+~" onRaise={onRaise} onOpenQuick={onOpenQuick} onOpenSettings={onOpenSettings} />);
  return { store, onOpenQuick, onOpenSettings };
}

afterEach(() => {
  vi.useRealTimers();
  seq = 0;
});

describe('Widget', () => {
  test('급한 것, 할일, 일정이 보인다', () => {
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
    expect(screen.getByText(/🗓 일정/)).toBeInTheDocument();
    expect(within(screen.getByTestId('event-list')).getByText('팀 회의')).toBeInTheDocument();
    expect(screen.getByText(/할일 \(3\)/)).toBeInTheDocument(); // 일정은 할일 개수에 들어가지 않는다
  });

  test('일정이 없으면 일정 칸 자체를 없앤다', () => {
    setup([item({ text: '메일 회신' })]);
    expect(screen.queryByText(/🗓 일정/)).toBeNull();
    expect(screen.queryByTestId('event-list')).toBeNull();
  });

  test('지난 일정은 보이지 않고, 오늘 완료한 일정은 완료 표시로 남는다', () => {
    setup([
      item({ text: '어제 미팅', kind: 'event', due: '2026-11-19T10:00', hasTime: true }),
      item({ text: '2시 미팅', kind: 'event', due: '2026-11-20T14:00', hasTime: true, done: true, updatedAt: NOW.getTime() }),
    ]);
    expect(screen.queryByText('어제 미팅')).toBeNull();
    expect(within(screen.getByTestId('event-list')).getByText('2시 미팅')).toBeInTheDocument();
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
    const { onOpenQuick, onOpenSettings } = setup([]);
    const btn = screen.getByRole('button', { name: /메모/ });
    expect(btn).toHaveTextContent('Alt+~');
    fireEvent.click(btn);
    expect(onOpenQuick).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('체크 칸은 완료 처리만 하고 설정 창을 열지 않는다', () => {
    const it = item({ text: '견적서', due: '2026-11-20T17:00', hasTime: true });
    const { store, onOpenSettings } = setup([it]);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(store.update).toHaveBeenCalledWith(it.id, { done: true });
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('삭제 버튼은 항목을 지우고 설정 창을 열지 않는다', () => {
    const it = item({ text: '잘못 적은 메모' });
    const { store, onOpenSettings } = setup([it]);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect((store as unknown as { remove: ReturnType<typeof vi.fn> }).remove).toHaveBeenCalledWith(it.id);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('항목이나 빈 곳을 눌러도 설정 창은 열리지 않는다', () => {
    const { onOpenSettings } = setup([item({ text: '견적서', due: '2026-11-20T17:00', hasTime: true })]);
    fireEvent.click(screen.getByText('견적서'));
    fireEvent.click(screen.getByTestId('urgent-list'));
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('설정 버튼만 설정 창을 연다', () => {
    const { onOpenSettings } = setup([]);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('윗줄(날짜)은 끌어서 옮기는 자리이고 눌러도 설정 창이 열리지 않는다', () => {
    const { onOpenSettings } = setup([]);
    const handle = screen.getByTestId('drag-handle');
    expect(handle).toHaveAttribute('data-tauri-drag-region');
    fireEvent.click(handle);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('위젯 입력칸에 쓰면 저장하고 설정 창은 열지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const store = fakeStore([]);
    const onOpenSettings = vi.fn();
    render(<Widget store={store} hotkeyLabel="Alt+~" onOpenQuick={() => {}} onOpenSettings={onOpenSettings} />);
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
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  test('자정을 넘기면 라벨과 빨간색이 바뀐다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T23:59:30'));
    const store = fakeStore([
      item({ text: '내일마감', due: '2026-11-21T00:00' }),
      item({ text: '오늘마감', due: '2026-11-20T00:00' }),
    ]);
    render(<Widget store={store} hotkeyLabel="Alt+~" onOpenQuick={() => {}} onOpenSettings={() => {}} />);
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

  test('항목이 아주 많거나 길어도 목록 전체가 스크롤되고 긴 글은 말줄임으로 처리한다', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      item({ text: i === 0 ? 'ㄱ'.repeat(120) : `일${i}`, due: '2026-11-25T00:00' }),
    );
    setup(many);
    expect(screen.getByTestId('scroll-area')).toHaveStyle({ overflowY: 'auto' });
    const long = screen.getByText('ㄱ'.repeat(120));
    expect(long).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' });
  });

  test('안내 문구(notice)가 있으면 위쪽에 보여 준다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    render(
      <Widget
        store={fakeStore([])}
        hotkeyLabel="Alt+~"
        notice="이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요"
        onOpenQuick={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('이미 사용 중인 키입니다');
  });

  test('스크롤 칸은 스크롤바와 삭제 버튼이 겹치지 않게 오른쪽 여백을 둔다', () => {
    setup([item({ text: '가', due: '2026-11-25T00:00' }), item({ text: '나' })]);
    expect(screen.getByTestId('scroll-area').style.paddingRight).toBe('10px');
  });

  test('어두운 배경에서도 보이도록 한 단계 밝은 바탕과 밝은 테두리를 가진다', () => {
    setup([]);
    expect(screen.getByTestId('widget-root')).toHaveStyle({
      background: '#262629',
      border: '1.5px solid rgba(255,255,255,0.45)',
      borderRadius: '14px',
    });
  });

  test('창 높이를 가득 채우고, 위·아래 줄은 고정한 채 가운데 목록만 줄어든다', () => {
    setup([]);
    expect(screen.getByTestId('widget-root')).toHaveStyle({ height: '100vh', display: 'flex', flexDirection: 'column' });
    expect(['0', '0px']).toContain(screen.getByTestId('scroll-area').style.minHeight);
    expect(screen.getByTestId('widget-top')).toHaveStyle({ flexShrink: '0' });
    expect(screen.queryByRole('button', { name: /대시보드/ })).toBeNull();
  });

  test('오늘 완료한 항목은 사라지지 않고 완료 표시와 함께 남는다', () => {
    const done = item({ text: '전화 회신', done: true, updatedAt: new Date('2026-11-20T08:00').getTime() });
    const yesterday = item({ text: '어제 끝낸 일', done: true, updatedAt: new Date('2026-11-19T10:00').getTime() });
    const open = item({ text: '남은 일' });
    const { store } = setup([open, done, yesterday]);
    expect(screen.getByText(/할일 \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText('어제 끝낸 일')).toBeNull();
    const row = screen.getByText('전화 회신').closest('[data-testid="row"]') as HTMLElement;
    expect(within(row).getByText('완료')).toBeInTheDocument();
    expect(screen.getByText('전화 회신')).toHaveStyle({ textDecoration: 'line-through' });
    const box = within(row).getByRole('checkbox');
    expect(box).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(box);
    expect(store.update).toHaveBeenCalledWith(done.id, { done: false });
    const rows = screen.getAllByTestId('row').map((r) => r.textContent);
    expect(rows.findIndex((t) => t?.includes('남은 일'))).toBeLessThan(rows.findIndex((t) => t?.includes('전화 회신')));
  });

  test('메모 글자를 누르면 그 자리에서 고치고 Enter로 저장한다', async () => {
    const it = item({ text: '견적서 보내기', due: '2026-11-25T00:00' });
    const { store, onOpenSettings } = setup([it]);
    const user = userEvent.setup();
    await user.click(screen.getByText('견적서 보내기'));
    const box = screen.getByRole('textbox', { name: '메모 고치기' });
    expect(box).toHaveValue('견적서 보내기');
    await user.clear(box);
    await user.type(box, '견적서 수정해서 보내기{Enter}');
    expect(store.update).toHaveBeenCalledWith(it.id, { text: '견적서 수정해서 보내기' });
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '메모 고치기' })).toBeNull();
  });

  test('고치다가 Esc를 누르거나 비워 두면 저장하지 않는다', async () => {
    const it = item({ text: '원래 글' });
    const { store } = setup([it]);
    const user = userEvent.setup();
    await user.click(screen.getByText('원래 글'));
    await user.type(screen.getByRole('textbox', { name: '메모 고치기' }), ' 추가{Escape}');
    expect(store.update).not.toHaveBeenCalled();
    expect(screen.getByText('원래 글')).toBeInTheDocument();
    await user.click(screen.getByText('원래 글'));
    await user.clear(screen.getByRole('textbox', { name: '메모 고치기' }));
    await user.keyboard('{Enter}');
    expect(store.update).not.toHaveBeenCalled();
  });

  test('글을 바꾸지 않고 Enter를 눌러도 저장 요청을 보내지 않는다', async () => {
    const it = item({ text: '그대로' });
    const { store } = setup([it]);
    const user = userEvent.setup();
    await user.click(screen.getByText('그대로'));
    await user.keyboard('{Enter}');
    expect(store.update).not.toHaveBeenCalled();
  });

  test('위젯의 아무 곳이나 누르면 맨 앞으로 올려 달라고 요청한다', () => {
    const onRaise = vi.fn();
    setup([item({ text: '견적서' })], {}, onRaise);
    fireEvent.mouseDown(screen.getByText('견적서'));
    fireEvent.mouseDown(screen.getByTestId('drag-handle'));
    expect(onRaise).toHaveBeenCalledTimes(2);
  });

  test('저장소 오류 문구를 위쪽에 보여 준다', () => {
    setup([], { status: 'error', error: '데이터 파일을 저장하지 못했습니다: disk full' });
    expect(screen.getByRole('alert')).toHaveTextContent('데이터 파일을 저장하지 못했습니다: disk full');
  });
});
