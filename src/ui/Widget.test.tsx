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
    updateMany: vi.fn().mockResolvedValue(undefined),
    ...extra,
  };
  return store as unknown as ItemsStore & { add: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
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

type Fake = ReturnType<typeof fakeStore>;
type Patch = { id: string; patch: Record<string, unknown> };
/** 한꺼번에 저장 요청된 변경 중 해당 항목의 가장 최근 변경 내용 */
const patchOf = (store: Fake, id: string) =>
  (store.updateMany.mock.calls.flatMap((c) => c[0] as Patch[]) as Patch[]).reverse().find((p) => p.id === id)?.patch;
/** 마지막 저장 요청을 (항목 id → 새 순번) 순서대로 */
const lastOrders = (store: Fake) => (store.updateMany.mock.calls.at(-1)![0] as Patch[]).map((p) => [p.id, p.patch.order]);

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

  describe('급한 것으로 옮기기', () => {
    const dt = () => {
      const data: Record<string, string> = {};
      return { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] ?? '', effectAllowed: '', dropEffect: '' };
    };

    test('할일을 끌어 급한 것 칸에 놓으면 급함 표시가 붙는다', () => {
      const todo = item({ text: '메일 회신' });
      const { store } = setup([todo]);
      const transfer = dt();
      fireEvent.dragStart(screen.getByText('메일 회신').closest('li')!, { dataTransfer: transfer });
      fireEvent.dragOver(screen.getByTestId('urgent-zone'), { dataTransfer: transfer });
      fireEvent.drop(screen.getByTestId('urgent-zone'), { dataTransfer: transfer });
      expect(patchOf(store, todo.id)).toMatchObject({ urgent: true });
    });

    test('급한 것을 끌어 할일 칸에 놓으면 급함 표시가 풀린다', () => {
      const flagged = item({ text: '전화하기', urgent: true });
      const { store } = setup([flagged]);
      const transfer = dt();
      fireEvent.dragStart(screen.getByText('전화하기').closest('li')!, { dataTransfer: transfer });
      fireEvent.drop(screen.getByTestId('todo-zone'), { dataTransfer: transfer });
      expect(patchOf(store, flagged.id)).toMatchObject({ urgent: false });
    });

    test('같은 칸에 놓거나, 목록에 없는 것을 놓으면 아무 일도 없다', () => {
      const todo = item({ text: '메일 회신' });
      const { store } = setup([todo]);
      const transfer = dt();
      fireEvent.dragStart(screen.getByText('메일 회신').closest('li')!, { dataTransfer: transfer });
      fireEvent.drop(screen.getByTestId('todo-zone'), { dataTransfer: transfer });
      const other = dt();
      other.setData('text/plain', 'nope');
      fireEvent.drop(screen.getByTestId('urgent-zone'), { dataTransfer: other });
      expect(store.update).not.toHaveBeenCalled();
      expect(store.updateMany).not.toHaveBeenCalled();
    });

    test('끌기가 어려울 때를 위해 🔥 버튼으로도 올리고 내릴 수 있다', async () => {
      const todo = item({ text: '메일 회신' });
      const flagged = item({ text: '전화하기', urgent: true });
      const { store } = setup([todo, flagged]);
      fireEvent.click(screen.getByRole('button', { name: '메일 회신 급한 것으로 올리기' }));
      expect(patchOf(store, todo.id)).toMatchObject({ urgent: true });
      fireEvent.click(screen.getByRole('button', { name: '전화하기 급한 것에서 내리기' }));
      expect(patchOf(store, flagged.id)).toMatchObject({ urgent: false });
    });

    test('마감이 있어 저절로 급한 것에 있는 항목도 버튼과 끌기로 할일로 내릴 수 있다', () => {
      const due = item({ text: '견적서', due: '2026-11-21T10:00', hasTime: true });
      const { store } = setup([due]);
      fireEvent.click(screen.getByRole('button', { name: '견적서 급한 것에서 내리기' }));
      expect(patchOf(store, due.id)).toMatchObject({ urgent: false });
      const transfer = dt();
      fireEvent.dragStart(screen.getByText('견적서').closest('li')!, { dataTransfer: transfer });
      fireEvent.drop(screen.getByTestId('todo-zone'), { dataTransfer: transfer });
      expect(store.updateMany).toHaveBeenCalledTimes(2);
    });

    test('마감이 있어도 할일로 내려 둔 항목은 올리기 버튼이 보인다', () => {
      const lowered = item({ text: '견적서', due: '2026-11-21T10:00', hasTime: true, urgent: false });
      const { store } = setup([lowered]);
      expect(within(screen.getByTestId('todo-list')).getByText('견적서')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '견적서 급한 것으로 올리기' }));
      expect(patchOf(store, lowered.id)).toMatchObject({ urgent: true });
    });

    test('이동 버튼은 이모지만이 아니라 글자가 있어 눈에 잘 띈다', () => {
      setup([item({ text: '메일 회신' }), item({ text: '전화하기', urgent: true })]);
      expect(screen.getByRole('button', { name: '메일 회신 급한 것으로 올리기' })).toHaveTextContent('급함');
      expect(screen.getByRole('button', { name: '전화하기 급한 것에서 내리기' })).toHaveTextContent('할일');
    });

    test('완료한 항목은 끌 수 없다', () => {
      setup([item({ text: '끝난 일', done: true, updatedAt: NOW.getTime() })]);
      expect(screen.getByText('끝난 일').closest('li')).toHaveAttribute('draggable', 'false');
    });
  });

  describe('번호', () => {
    const numbers = (id: string) =>
      within(screen.getByTestId(id))
        .queryAllByTestId('row-number')
        .map((n) => n.textContent);

    test('할일은 작성한 순서대로 1부터 번호가 붙는다', () => {
      setup([item({ text: '가', createdAt: 3 }), item({ text: '나', createdAt: 1 }), item({ text: '다', createdAt: 2 })]);
      const rows = within(screen.getByTestId('todo-list')).getAllByTestId('row');
      expect(rows.map((r) => r.textContent?.replace(/[^가-힣0-9]/g, '').slice(0, 2))).toEqual(['1나', '2다', '3가']);
      expect(numbers('todo-list')).toEqual(['1', '2', '3']);
    });

    test('완료하면 그 항목은 번호가 없어지고 나머지 번호가 당겨진다', () => {
      setup([
        item({ text: '가', createdAt: 1 }),
        item({ text: '나', createdAt: 2, done: true, updatedAt: NOW.getTime() }),
        item({ text: '다', createdAt: 3 }),
      ]);
      expect(numbers('todo-list')).toEqual(['1', '2']);
    });

    test('급한 것으로 올리면 두 목록 모두 번호가 다시 매겨진다', () => {
      setup([item({ text: '가', createdAt: 1 }), item({ text: '나', createdAt: 2, urgent: true }), item({ text: '다', createdAt: 3 })]);
      expect(numbers('urgent-list')).toEqual(['1']);
      expect(numbers('todo-list')).toEqual(['1', '2']);
    });

    test('일정에는 번호를 붙이지 않는다', () => {
      setup([item({ text: '회의', kind: 'event', due: '2026-11-20T14:00', hasTime: true })]);
      expect(within(screen.getByTestId('event-list')).queryAllByTestId('row-number')).toEqual([]);
    });
  });

  test('삭제 버튼은 선명한 X 모양이다', () => {
    setup([item({ text: '가' })]);
    const del = screen.getByRole('button', { name: '삭제' });
    expect(del.querySelector('svg')).not.toBeNull();
    expect(del.textContent).toBe('');
    expect(del).toHaveStyle({ color: '#e0e0e0' });
  });

  describe('같은 칸 안에서 순서 바꾸기', () => {
    const dt = () => {
      const data: Record<string, string> = {};
      return { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] ?? '', effectAllowed: '', dropEffect: '' };
    };
    const rowOf = (text: string) => screen.getByText(text).closest('li')!;
    const dragOnto = (from: string, onto: HTMLElement) => {
      const transfer = dt();
      fireEvent.dragStart(rowOf(from), { dataTransfer: transfer });
      fireEvent.dragOver(onto, { dataTransfer: transfer });
      fireEvent.drop(onto, { dataTransfer: transfer });
    };

    test('항목을 다른 항목 위에 놓으면 그 앞으로 들어가고 순번이 새로 매겨진다', () => {
      const [a, b, c] = [item({ text: '가', createdAt: 1 }), item({ text: '나', createdAt: 2 }), item({ text: '다', createdAt: 3 })];
      const { store } = setup([a, b, c]);
      dragOnto('다', rowOf('가'));
      expect(lastOrders(store)).toEqual([[c.id, 1000], [a.id, 2000], [b.id, 3000]]);
    });

    test('아래로 옮길 때도 놓은 항목의 앞에 들어간다', () => {
      const [a, b, c] = [item({ text: '가', createdAt: 1 }), item({ text: '나', createdAt: 2 }), item({ text: '다', createdAt: 3 })];
      const { store } = setup([a, b, c]);
      dragOnto('가', rowOf('다'));
      expect(lastOrders(store)).toEqual([[b.id, 1000], [a.id, 2000], [c.id, 3000]]);
    });

    test('칸의 빈 곳(제목 줄 등)에 놓으면 맨 끝으로 간다', () => {
      const [a, b, c] = [item({ text: '가', createdAt: 1 }), item({ text: '나', createdAt: 2 }), item({ text: '다', createdAt: 3 })];
      const { store } = setup([a, b, c]);
      dragOnto('가', screen.getByTestId('todo-zone'));
      expect(lastOrders(store)).toEqual([[b.id, 1000], [c.id, 2000], [a.id, 3000]]);
    });

    test('자기 자리에 놓거나 이미 맨 끝인 것을 끝에 놓으면 저장하지 않는다', () => {
      const [a, b] = [item({ text: '가', createdAt: 1 }), item({ text: '나', createdAt: 2 })];
      const { store } = setup([a, b]);
      dragOnto('가', rowOf('가'));
      dragOnto('나', screen.getByTestId('todo-zone'));
      dragOnto('가', rowOf('나')); // 가는 이미 나의 바로 앞이다
      expect(store.updateMany).not.toHaveBeenCalled();
    });

    test('이미 정해 둔 순서가 있으면 그 순서를 기준으로 다시 정한다', () => {
      const [a, b, c] = [item({ text: '가', order: 2000 }), item({ text: '나', order: 1000 }), item({ text: '다', createdAt: 99 })];
      const { store } = setup([a, b, c]); // 화면 순서: 나, 가, 다
      dragOnto('다', rowOf('나'));
      expect(lastOrders(store)).toEqual([[c.id, 1000], [b.id, 2000], [a.id, 3000]]);
    });

    test('일정끼리도 순서를 바꿀 수 있다', () => {
      const e1 = item({ text: '회의1', kind: 'event', due: '2026-11-20T10:00', hasTime: true });
      const e2 = item({ text: '회의2', kind: 'event', due: '2026-11-20T14:00', hasTime: true });
      const { store } = setup([e1, e2]);
      dragOnto('회의2', rowOf('회의1'));
      expect(lastOrders(store)).toEqual([[e2.id, 1000], [e1.id, 2000]]);
    });

    test('일정은 급한 것이나 할일 칸으로 옮길 수 없다', () => {
      const e1 = item({ text: '회의', kind: 'event', due: '2026-11-20T10:00', hasTime: true });
      const { store } = setup([e1, item({ text: '가' })]);
      dragOnto('회의', screen.getByTestId('urgent-zone'));
      dragOnto('회의', rowOf('가'));
      expect(store.updateMany).not.toHaveBeenCalled();
    });

    test('다른 칸의 항목 위에 놓으면 그 칸으로 옮겨지면서 그 앞에 들어간다', () => {
      const flagged = item({ text: '급함', urgent: true, createdAt: 1 });
      const todo = item({ text: '할것', createdAt: 2 });
      const { store } = setup([flagged, todo]);
      dragOnto('할것', rowOf('급함'));
      expect(patchOf(store, todo.id)).toEqual({ urgent: true, order: 1000 });
      expect(patchOf(store, flagged.id)).toEqual({ order: 2000 });
    });

    test('완료한 항목은 순서 바꾸기의 대상이 아니다', () => {
      const done = item({ text: '끝', done: true, updatedAt: NOW.getTime() });
      const { store } = setup([done, item({ text: '가' })]);
      dragOnto('가', rowOf('끝'));
      expect(store.updateMany).not.toHaveBeenCalled();
    });
  });
});
