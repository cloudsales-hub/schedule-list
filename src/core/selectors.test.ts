import { describe, expect, test } from 'vitest';
import type { Item } from './model';
import { createItem, updateItem } from './model';
import { doneToday, markedDays, plainTodos, soonTasks, upcomingEvents, urgentTasks } from './selectors';

const now = new Date('2026-11-20T09:00');

function mk(p: Partial<Item> & { id: string }): Item {
  return {
    text: p.id,
    kind: 'task',
    due: null,
    hasTime: false,
    done: false,
    deleted: false,
    createdAt: 1,
    updatedAt: 1,
    ...p,
  };
}

describe('urgentTasks', () => {
  test('마감 있는 할일만 마감 빠른 순으로, 일정과 마감 없는 것은 제외', () => {
    const items = [
      mk({ id: 'a', due: '2026-11-21T12:00', hasTime: true }),
      mk({ id: 'b', due: '2026-11-20T17:00', hasTime: true }),
      mk({ id: 'n1' }),
      mk({ id: 'n2' }),
      mk({ id: 'n3' }),
      mk({ id: 'ev', kind: 'event', due: '2026-11-20T16:30', hasTime: true }),
    ];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('이미 지난 마감도 맨 앞에 포함된다', () => {
    const items = [
      mk({ id: 'late', due: '2026-11-18T00:00' }),
      mk({ id: 'today', due: '2026-11-20T17:00', hasTime: true }),
    ];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['late', 'today']);
  });

  test('완료되었거나 삭제된 항목은 제외', () => {
    const items = [
      mk({ id: 'done', due: '2026-11-20T10:00', done: true }),
      mk({ id: 'del', due: '2026-11-20T10:00', deleted: true }),
      mk({ id: 'ok', due: '2026-11-20T10:00' }),
    ];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['ok']);
  });
});

describe('soonTasks', () => {
  test('오늘 + 7일(11/27)까지는 포함하고 11/28부터는 제외', () => {
    const items = [
      mk({ id: 'in', due: '2026-11-27T00:00' }),
      mk({ id: 'out', due: '2026-11-28T00:00' }),
    ];
    expect(soonTasks(items, now).map((i) => i.id)).toEqual(['in']);
  });
});

describe('plainTodos', () => {
  test('마감 없는 할일을 만든 순서(오래된 것 먼저)로, 완료된 것은 제외', () => {
    const items = [
      mk({ id: 'c3', createdAt: 3 }),
      mk({ id: 'c1', createdAt: 1 }),
      mk({ id: 'c2', createdAt: 2 }),
      mk({ id: 'done', createdAt: 0, done: true }),
      mk({ id: 'dated', due: '2026-11-21T00:00', createdAt: 0 }),
    ];
    expect(plainTodos(items).map((i) => i.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('upcomingEvents', () => {
  const items = [
    mk({ id: 'yesterday', kind: 'event', due: '2026-11-19T10:00', hasTime: true }),
    mk({ id: 'later', kind: 'event', due: '2026-11-24T10:00', hasTime: true }),
    mk({ id: 'today', kind: 'event', due: '2026-11-20T16:30', hasTime: true }),
    mk({ id: 'task', due: '2026-11-21T10:00' }),
  ];

  test('오늘 0시 이후 일정만 빠른 순으로', () => {
    expect(upcomingEvents(items, now).map((i) => i.id)).toEqual(['today', 'later']);
  });

  test('limit 개수만큼만', () => {
    expect(upcomingEvents(items, now, 1).map((i) => i.id)).toEqual(['today']);
  });
});

describe('markedDays', () => {
  test('일정과 마감이 있는 날(일)을 모은다. 삭제·완료·마감 없음은 제외', () => {
    const items = [
      mk({ id: 'ev', kind: 'event', due: '2026-11-24T10:00', hasTime: true }),
      mk({ id: 'dl', due: '2026-11-27T00:00' }),
      mk({ id: 'del', due: '2026-11-05T00:00', deleted: true }),
      mk({ id: 'done', due: '2026-11-06T00:00', done: true }),
      mk({ id: 'none' }),
      mk({ id: 'other-month', due: '2026-12-03T00:00' }),
    ];
    expect([...markedDays(items, 2026, 11)].sort((a, b) => a - b)).toEqual([24, 27]);
  });
});

describe('createItem / updateItem', () => {
  test('createItem은 고유 id와 현재 시각을 넣는다', () => {
    const a = createItem({ text: '견적서', kind: 'task', due: null, hasTime: false }, now);
    const b = createItem({ text: '견적서', kind: 'task', due: null, hasTime: false }, now);
    expect(a.id).not.toBe(b.id);
    expect(a.createdAt).toBe(now.getTime());
    expect(a.updatedAt).toBe(now.getTime());
    expect(a.done).toBe(false);
    expect(a.deleted).toBe(false);
  });

  test('updateItem은 updatedAt을 갱신하고 createdAt은 유지한다', () => {
    const a = createItem({ text: '견적서', kind: 'task', due: null, hasTime: false }, now);
    const later = new Date('2026-11-20T10:00');
    const b = updateItem(a, { done: true }, later);
    expect(b.done).toBe(true);
    expect(b.updatedAt).toBe(later.getTime());
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.id).toBe(a.id);
  });
});

describe('doneToday', () => {
  const t = (iso: string) => new Date(iso).getTime();
  test('오늘 0시 이후에 완료한 항목만, 완료한 순서로', () => {
    const items = [
      mk({ id: 'late', done: true, updatedAt: t('2026-11-20T08:00') }),
      mk({ id: 'early', done: true, updatedAt: t('2026-11-20T00:01') }),
      mk({ id: 'yesterday', done: true, updatedAt: t('2026-11-19T23:59') }),
      mk({ id: 'gone', done: true, deleted: true, updatedAt: t('2026-11-20T08:30') }),
      mk({ id: 'open', updatedAt: t('2026-11-20T08:30') }),
    ];
    expect(doneToday(items, now).map((i) => i.id)).toEqual(['early', 'late']);
  });
  test('자정이 지나면 전날 완료한 것은 사라진다', () => {
    const items = [mk({ id: 'a', done: true, updatedAt: t('2026-11-20T08:00') })];
    expect(doneToday(items, new Date('2026-11-21T00:01'))).toEqual([]);
  });
});

describe('급함 표시(urgent)', () => {
  test('마감이 없어도 급함 표시가 있으면 급한 것에 들어가고 할일에서는 빠진다', () => {
    const items = [
      mk({ id: 'plain', createdAt: 1 }),
      mk({ id: 'flagged', createdAt: 2, urgent: true }),
    ];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['flagged']);
    expect(plainTodos(items).map((i) => i.id)).toEqual(['plain']);
  });

  test('급함 표시만 있는 것은 마감 있는 것보다 위에, 만든 순서대로 놓는다', () => {
    const items = [
      mk({ id: 'due', due: '2026-11-20T10:00', hasTime: true, createdAt: 1 }),
      mk({ id: 'f2', urgent: true, createdAt: 3 }),
      mk({ id: 'f1', urgent: true, createdAt: 2 }),
    ];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['f1', 'f2', 'due']);
  });

  test('급함 표시를 풀어도 마감이 있으면 계속 급한 것에 남는다', () => {
    const items = [mk({ id: 'a', due: '2026-11-25T00:00', urgent: false })];
    expect(urgentTasks(items, now).map((i) => i.id)).toEqual(['a']);
  });

  test('일정은 급함 표시가 있어도 급한 것에 들어가지 않는다', () => {
    const items = [mk({ id: 'e', kind: 'event', due: '2026-11-20T10:00', urgent: true })];
    expect(urgentTasks(items, now)).toEqual([]);
  });

  test('마감 없는 급한 항목이 있어도 임박 목록(soonTasks)은 오류 없이 마감 있는 것만 돌려준다', () => {
    const items = [mk({ id: 'f', urgent: true }), mk({ id: 'd', due: '2026-11-21T09:00' })];
    expect(soonTasks(items, now).map((i) => i.id)).toEqual(['d']);
  });
});
