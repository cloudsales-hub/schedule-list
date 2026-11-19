import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '../core/model';
import type { ItemsStore } from '../core/store';
import { Clock } from './Clock';
import { Dashboard } from './Dashboard';
import type { Settings } from './api';

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

const settings: Settings = { hotkey: 'Super+J', dataDir: null, autostart: true, bannerPath: null, bannerHeight: 320 };

function fakeStore(items: Item[]) {
  return {
    items,
    status: 'ready',
    error: null,
    subscribe: () => () => {},
    add: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as ItemsStore & {
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
}

function setup(items: Item[], s: Settings = settings) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const store = fakeStore(items);
  const onOpenSettings = vi.fn();
  render(<Dashboard store={store} settings={s} onOpenSettings={onOpenSettings} />);
  return { store, onOpenSettings };
}

afterEach(() => {
  vi.useRealTimers();
  seq = 0;
});

const card = (id: string) => screen.getByTestId(id);

describe('Dashboard', () => {
  test('네 카드가 있고 최근 완료 카드는 없다', () => {
    setup([]);
    expect(screen.getByRole('heading', { name: /오늘 \/ 임박/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '🗓 일정' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /📝 할일/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /11월/ })).toBeInTheDocument();
    expect(screen.queryByText(/최근 완료/)).toBeNull();
  });

  test('항목은 종류에 맞는 카드에만 나타난다', () => {
    setup([
      item({ text: '견적서', due: '2026-11-21T00:00' }),
      item({ text: '팀 회의', kind: 'event', due: '2026-11-24T15:00', hasTime: true }),
      item({ text: '메일 회신' }),
    ]);
    expect(within(card('card-soon')).getByText('견적서')).toBeInTheDocument();
    expect(within(card('card-soon')).queryByText('팀 회의')).toBeNull();
    expect(within(card('card-soon')).queryByText('메일 회신')).toBeNull();
    expect(within(card('card-events')).getByText('팀 회의')).toBeInTheDocument();
    expect(within(card('card-events')).getByText(/15:00/)).toBeInTheDocument();
    expect(within(card('card-events')).queryByText('견적서')).toBeNull();
    expect(within(card('card-todos')).getByText('메일 회신')).toBeInTheDocument();
    expect(within(card('card-todos')).queryByText('견적서')).toBeNull();
  });

  test('달력에 일정·마감 있는 날과 오늘이 표시되고 ▶로 다음 달로 간다', () => {
    setup([
      item({ kind: 'event', due: '2026-11-24T15:00', hasTime: true }),
      item({ due: '2026-11-27T00:00' }),
    ]);
    expect(screen.getByTestId('dot-24')).toBeInTheDocument();
    expect(screen.getByTestId('dot-27')).toBeInTheDocument();
    expect(screen.queryByTestId('dot-25')).toBeNull();
    expect(screen.getByTestId('day-20')).toHaveAttribute('data-today', 'true');
    expect(screen.getByTestId('day-21')).toHaveAttribute('data-today', 'false');
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('heading', { name: /2026년 12월/ })).toBeInTheDocument();
    expect(screen.queryByTestId('dot-24')).toBeNull();
    expect(screen.getByTestId('day-20')).toHaveAttribute('data-today', 'false');
  });

  test('체크는 완료 처리, 삭제는 remove를 호출한다', () => {
    const it = item({ text: '메일 회신' });
    const { store } = setup([it]);
    const row = screen.getByText('메일 회신').closest('[data-testid="row"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    expect(store.update).toHaveBeenCalledWith(it.id, { done: true });
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));
    expect(store.remove).toHaveBeenCalledWith(it.id);
  });

  test('수정에서 글자와 종류와 마감을 바꿀 수 있다', async () => {
    const it = item({ text: '회의 준비', due: '2026-11-25T00:00' });
    const { store } = setup([it]);
    const user = userEvent.setup();
    const row = screen.getByText('회의 준비').closest('[data-testid="row"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '수정' }));
    const text = screen.getByLabelText('내용');
    await user.clear(text);
    await user.type(text, '회의 자료 준비');
    await user.selectOptions(screen.getByLabelText('종류'), 'event');
    fireEvent.change(screen.getByLabelText('시간'), { target: { value: '14:30' } });
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(store.update).toHaveBeenCalledWith(it.id, {
      text: '회의 자료 준비',
      kind: 'event',
      due: '2026-11-25T14:30',
      hasTime: true,
    });
  });

  test('날짜가 없으면 일정으로 저장할 수 없다', async () => {
    const it = item({ text: '메일 회신' });
    setup([it]);
    const user = userEvent.setup();
    const row = screen.getByText('메일 회신').closest('[data-testid="row"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '수정' }));
    await user.selectOptions(screen.getByLabelText('종류'), 'event');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  test.each([320, 240] as const)('배너 높이는 설정값 %ipx이다', (h) => {
    setup([], { ...settings, bannerHeight: h });
    expect(screen.getByRole('img', { name: '배너' })).toHaveStyle({ height: `${h}px` });
  });

  test('시계는 시, 분, 초를 표시한다', () => {
    render(<Clock now={new Date('2026-11-20T09:05:07')} />);
    expect(screen.getByText('09')).toBeInTheDocument();
    expect(screen.getByText('05')).toBeInTheDocument();
    expect(screen.getByText('07')).toBeInTheDocument();
  });

  test('입력칸에 쓰고 Enter를 누르면 할일로 저장된다', async () => {
    const { store } = setup([]);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '메모' }), '보고서 오탈자 확인');
    await user.keyboard('{Enter}');
    expect(store.add).toHaveBeenCalledWith({ text: '보고서 오탈자 확인', kind: 'task', due: null, hasTime: false });
  });

  test('overlay가 있으면 설정 화면을 위에 겹쳐 보여 준다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    render(<Dashboard store={fakeStore([])} settings={settings} onOpenSettings={() => {}} overlay={<p>설정 내용</p>} />);
    expect(within(screen.getByRole('dialog', { name: '설정' })).getByText('설정 내용')).toBeInTheDocument();
  });

  test('⚙를 누르면 설정을 연다', () => {
    const { onOpenSettings } = setup([]);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
