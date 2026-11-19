import { describe, expect, test } from 'vitest';
import type { Item } from './model';
import { mergeItems, parseDataFile, purgeDeleted, serializeDataFile } from './merge';

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

const ids = (items: Item[]) => items.map((i) => i.id).sort();

describe('mergeItems (Review Focus 2)', () => {
  test('한쪽에만 있는 항목은 모두 남는다', () => {
    const a = [mk({ id: 'x' })];
    const b = [mk({ id: 'y' })];
    expect(ids(mergeItems(a, b))).toEqual(['x', 'y']);
  });

  test('같은 id는 updatedAt이 큰 쪽이 이긴다', () => {
    const a = [mk({ id: 'x', text: '옛날', updatedAt: 10 })];
    const b = [mk({ id: 'x', text: '새것', updatedAt: 20 })];
    expect(mergeItems(a, b)[0].text).toBe('새것');
    expect(mergeItems(b, a)[0].text).toBe('새것');
  });

  test('updatedAt이 같으면 deleted:true인 쪽이 이긴다', () => {
    const a = [mk({ id: 'x', updatedAt: 10, deleted: false })];
    const b = [mk({ id: 'x', updatedAt: 10, deleted: true })];
    expect(mergeItems(a, b)[0].deleted).toBe(true);
    expect(mergeItems(b, a)[0].deleted).toBe(true);
  });

  test('둘 다 같으면 a를 쓴다', () => {
    const a = [mk({ id: 'x', text: 'A', updatedAt: 10 })];
    const b = [mk({ id: 'x', text: 'B', updatedAt: 10 })];
    expect(mergeItems(a, b)[0].text).toBe('A');
  });

  test('순서를 바꿔도 id 집합이 같다', () => {
    const a = [mk({ id: '1', updatedAt: 5 }), mk({ id: '2', updatedAt: 9 })];
    const b = [mk({ id: '2', updatedAt: 3 }), mk({ id: '3', updatedAt: 1 })];
    expect(ids(mergeItems(a, b))).toEqual(ids(mergeItems(b, a)));
  });

  test('입력 배열을 바꾸지 않는다', () => {
    const a = [mk({ id: 'x' })];
    const b = [mk({ id: 'y' })];
    mergeItems(a, b);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('purgeDeleted', () => {
  const now = new Date('2026-11-20T09:00');
  const dayMs = 86400000;

  test('삭제된 지 31일 넘은 항목은 제거, 29일은 유지', () => {
    const items = [
      mk({ id: 'old', deleted: true, updatedAt: now.getTime() - 31 * dayMs }),
      mk({ id: 'recent', deleted: true, updatedAt: now.getTime() - 29 * dayMs }),
    ];
    expect(ids(purgeDeleted(items, now))).toEqual(['recent']);
  });

  test('삭제되지 않은 오래된 항목은 유지', () => {
    const items = [mk({ id: 'alive', updatedAt: now.getTime() - 400 * dayMs })];
    expect(ids(purgeDeleted(items, now))).toEqual(['alive']);
  });

  test('days 인자를 바꿀 수 있다', () => {
    const items = [mk({ id: 'x', deleted: true, updatedAt: now.getTime() - 8 * dayMs })];
    expect(purgeDeleted(items, now, 7)).toHaveLength(0);
  });
});

describe('parseDataFile (Review Focus 3)', () => {
  test('null과 공백은 empty', () => {
    expect(parseDataFile(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseDataFile('  \n ')).toEqual({ ok: false, reason: 'empty' });
  });

  test('깨진 JSON은 corrupt', () => {
    expect(parseDataFile('{깨짐')).toEqual({ ok: false, reason: 'corrupt' });
  });

  test('버전이 다르거나 items가 배열이 아니면 corrupt', () => {
    expect(parseDataFile('{"version":2,"items":[]}')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseDataFile('{"version":1,"items":"x"}')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseDataFile('[]')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseDataFile('null')).toEqual({ ok: false, reason: 'corrupt' });
  });

  test('직렬화 후 다시 파싱하면 같은 items', () => {
    const items = [mk({ id: 'a', text: '견적서 확인', due: '2026-11-21T12:00', hasTime: true })];
    const r = parseDataFile(serializeDataFile(items));
    expect(r).toEqual({ ok: true, data: { version: 1, items } });
  });

  test('빈 목록도 올바른 파일이다', () => {
    const r = parseDataFile(serializeDataFile([]));
    expect(r).toEqual({ ok: true, data: { version: 1, items: [] } });
  });

  test('직렬화는 들여쓰기 2칸', () => {
    expect(serializeDataFile([])).toContain('\n  "version": 1');
  });
});
