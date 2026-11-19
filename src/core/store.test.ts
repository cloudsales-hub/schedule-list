import { describe, expect, test } from 'vitest';
import type { Item } from './model';
import { parseDataFile, serializeDataFile } from './merge';
import { plainTodos } from './selectors';
import { ItemsStore, type Backend } from './store';

class FakeBackend implements Backend {
  content: string | null = null;
  writes = 0;
  backups = 0;
  failRead = false;
  failWrite = false;
  private listeners = new Set<() => void>();

  async read() {
    if (this.failRead) throw new Error('boom');
    return this.content;
  }
  async write(text: string) {
    if (this.failWrite) throw new Error('disk full');
    this.content = text;
    this.writes++;
  }
  async backupCorrupt() {
    this.backups++;
    this.content = null; // 실제 백엔드도 원래 파일을 옮겨서 비운다
  }
  onChanged(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  fire() {
    this.listeners.forEach((cb) => cb());
  }
  get fileItems(): Item[] {
    const r = parseDataFile(this.content);
    if (!r.ok) throw new Error('파일이 올바르지 않다');
    return r.data.items;
  }
}

const NOW = new Date('2026-11-20T09:00');
const DAY = 86400000;

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

function setup() {
  const backend = new FakeBackend();
  const store = new ItemsStore(backend, () => NOW);
  return { backend, store };
}
const task = (text: string) => ({ text, kind: 'task' as const, due: null, hasTime: false });

describe('load', () => {
  test('파일이 없으면 빈 목록으로 준비 완료', async () => {
    const { store } = setup();
    expect(store.status).toBe('loading');
    await store.load();
    expect(store.items).toEqual([]);
    expect(store.status).toBe('ready');
    expect(store.error).toBeNull();
  });

  test('기존 파일의 항목을 불러온다', async () => {
    const { backend, store } = setup();
    backend.content = serializeDataFile([mk({ id: 'a' })]);
    await store.load();
    expect(store.items.map((i) => i.id)).toEqual(['a']);
  });

  test('(Review Focus 3) 깨진 파일은 백업 1번 후 빈 목록으로 시작하고 이후 저장해도 백업이 늘지 않는다', async () => {
    const { backend, store } = setup();
    backend.content = '{깨짐';
    await store.load();
    expect(backend.backups).toBe(1);
    expect(store.items).toEqual([]);
    expect(store.status).toBe('ready');

    await store.add(task('견적서 확인'));
    expect(backend.backups).toBe(1);
    expect(backend.fileItems.map((i) => i.text)).toEqual(['견적서 확인']);
  });

  test('삭제 표시된 지 30일이 넘은 항목은 불러올 때 정리되고 파일에서도 사라진다', async () => {
    const { backend, store } = setup();
    backend.content = serializeDataFile([
      mk({ id: 'old', deleted: true, updatedAt: NOW.getTime() - 40 * DAY }),
      mk({ id: 'keep' }),
    ]);
    await store.load();
    expect(store.items.map((i) => i.id)).toEqual(['keep']);
    expect(backend.fileItems.map((i) => i.id)).toEqual(['keep']);
  });

  test('읽기에 실패하면 error 상태와 한국어 메시지, 이전 항목은 유지', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('남아 있어야 함'));
    backend.failRead = true;
    await store.load();
    expect(store.status).toBe('error');
    expect(store.error).toContain('불러오지');
    expect(store.items.map((i) => i.text)).toEqual(['남아 있어야 함']);
  });
});

describe('add / update / remove', () => {
  test('add는 파일에 저장하고 현재 시각을 createdAt으로 쓴다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add({ text: '내일 3시 회의', kind: 'event', due: '2026-11-21T15:00', hasTime: true });
    const saved = backend.fileItems;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ text: '내일 3시 회의', kind: 'event', due: '2026-11-21T15:00', hasTime: true });
    expect(saved[0].createdAt).toBe(NOW.getTime());
  });

  test('연속으로 add해도 둘 다 저장된다', async () => {
    const { backend, store } = setup();
    await store.load();
    await Promise.all([store.add(task('첫째')), store.add(task('둘째'))]);
    expect(backend.fileItems.map((i) => i.text).sort()).toEqual(['둘째', '첫째']);
  });

  test('update는 파일과 목록을 바꾼다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('견적서'));
    const id = store.items[0].id;
    await store.update(id, { done: true });
    expect(store.items[0].done).toBe(true);
    expect(backend.fileItems[0].done).toBe(true);
  });

  test('remove는 deleted:true로 표시하고 선택 함수에서는 보이지 않는다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('지울 것'));
    const id = store.items[0].id;
    await store.remove(id);
    expect(backend.fileItems[0].deleted).toBe(true);
    expect(plainTodos(store.items)).toEqual([]);
  });

  test('쓰기에 실패하면 error 상태이고 항목은 메모리에 남으며, 다음 성공 때 오류가 풀린다', async () => {
    const { backend, store } = setup();
    await store.load();
    backend.failWrite = true;
    await store.add(task('저장 실패'));
    expect(store.status).toBe('error');
    expect(store.error).toContain('저장');
    expect(store.items.map((i) => i.text)).toEqual(['저장 실패']);

    backend.failWrite = false;
    await store.add(task('저장 성공'));
    expect(store.status).toBe('ready');
    expect(store.error).toBeNull();
    expect(backend.fileItems.map((i) => i.text).sort()).toEqual(['저장 성공', '저장 실패']);
  });
});

describe('두 PC 동기화 (Review Focus 2)', () => {
  test('다른 PC가 파일을 바꾸면 내 항목은 남기고 그 항목을 가져온다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('내가 추가'));
    const mine = backend.fileItems[0];

    // 다른 PC가 자기 항목 X만 들어 있는 파일로 덮어썼다
    backend.content = serializeDataFile([mk({ id: 'X', text: '다른 PC가 추가', updatedAt: NOW.getTime() })]);
    backend.fire();
    await store.whenIdle();

    expect(store.items.map((i) => i.text).sort()).toEqual(['내가 추가', '다른 PC가 추가'].sort());
    expect(backend.fileItems.map((i) => i.id).sort()).toEqual([mine.id, 'X'].sort());
  });

  test('다른 PC가 방금 쓴 직후에 내가 add해도 그 항목이 파일에 남는다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('Y'));
    backend.content = serializeDataFile([...backend.fileItems, mk({ id: 'X', text: 'X', updatedAt: NOW.getTime() })]);

    await store.add(task('Z'));

    expect(backend.fileItems.map((i) => i.text).sort()).toEqual(['X', 'Y', 'Z']);
  });

  test('같은 항목은 나중에 수정한 쪽이 이긴다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('원래 글'));
    const item = backend.fileItems[0];
    backend.content = serializeDataFile([{ ...item, text: '다른 PC가 고친 글', updatedAt: item.updatedAt + 1000 }]);
    backend.fire();
    await store.whenIdle();
    expect(store.items[0].text).toBe('다른 PC가 고친 글');
  });

  test('파일 내용이 같으면 다시 쓰지 않는다', async () => {
    const { backend, store } = setup();
    await store.load();
    await store.add(task('하나'));
    const before = backend.writes;
    backend.fire();
    await store.whenIdle();
    expect(backend.writes).toBe(before);
  });
});

describe('subscribe', () => {
  test('변경될 때 알리고 해제하면 알리지 않는다', async () => {
    const { store } = setup();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    await store.load();
    const afterLoad = calls;
    expect(afterLoad).toBeGreaterThan(0);
    await store.add(task('하나'));
    expect(calls).toBeGreaterThan(afterLoad);
    off();
    const frozen = calls;
    await store.add(task('둘'));
    expect(calls).toBe(frozen);
  });

  test('dispose하면 파일 변경 알림 구독도 해제된다', async () => {
    const { backend, store } = setup();
    await store.load();
    store.dispose();
    backend.content = serializeDataFile([mk({ id: 'late' })]);
    backend.fire();
    await store.whenIdle();
    expect(store.items).toEqual([]);
  });
});
