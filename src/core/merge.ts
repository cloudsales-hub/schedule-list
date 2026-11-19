import type { Item } from './model';

export interface DataFile {
  version: 1;
  items: Item[];
}

export type LoadResult =
  | { ok: true; data: DataFile }
  | { ok: false; reason: 'empty' | 'corrupt' };

/** 파일 내용을 읽는다. 없거나 비었으면 empty, 형식이 틀리면 corrupt. */
export function parseDataFile(text: string | null): LoadResult {
  if (text === null || text.trim() === '') return { ok: false, reason: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'corrupt' };
  }
  const obj = parsed as { version?: unknown; items?: unknown };
  if (obj.version !== 1 || !Array.isArray(obj.items)) return { ok: false, reason: 'corrupt' };
  return { ok: true, data: { version: 1, items: obj.items as Item[] } };
}

export function serializeDataFile(items: Item[]): string {
  const file: DataFile = { version: 1, items };
  return JSON.stringify(file, null, 2);
}

/**
 * id 기준 합집합. 같은 id는 updatedAt이 큰 쪽, 같으면 deleted:true인 쪽, 그래도 같으면 a.
 * 입력 배열은 바꾸지 않는다.
 */
export function mergeItems(a: Item[], b: Item[]): Item[] {
  const byId = new Map<string, Item>();
  for (const it of a) byId.set(it.id, it);
  for (const other of b) {
    const mine = byId.get(other.id);
    if (!mine) {
      byId.set(other.id, other);
    } else if (other.updatedAt > mine.updatedAt) {
      byId.set(other.id, other);
    } else if (other.updatedAt === mine.updatedAt && other.deleted && !mine.deleted) {
      byId.set(other.id, other);
    }
  }
  return [...byId.values()];
}

/** 삭제 표시(deleted)된 지 days일(기본 30)이 넘은 항목을 지운다. */
export function purgeDeleted(items: Item[], now: Date, days = 30): Item[] {
  const limit = now.getTime() - days * 86400000;
  return items.filter((i) => !(i.deleted && i.updatedAt < limit));
}
