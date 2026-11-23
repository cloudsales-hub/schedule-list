export type ItemKind = 'event' | 'task';

export interface Item {
  id: string;
  text: string;
  kind: ItemKind;
  /** 'YYYY-MM-DDTHH:mm' (로컬 시각). 날짜만 있으면 'YYYY-MM-DDT00:00'. */
  due: string | null;
  hasTime: boolean;
  done: boolean;
  deleted: boolean;
  /** 마감이 없어도 직접 급한 것으로 올렸는지. 없으면(옛 데이터) false로 본다. */
  urgent?: boolean;
  /** epoch ms */
  createdAt: number;
  updatedAt: number;
}

export interface NewItem {
  text: string;
  kind: ItemKind;
  due: string | null;
  hasTime: boolean;
}

export type ItemPatch = Partial<Pick<Item, 'text' | 'kind' | 'due' | 'hasTime' | 'done' | 'deleted' | 'urgent'>>;

export function createItem(p: NewItem, now: Date): Item {
  return {
    id: crypto.randomUUID(),
    text: p.text,
    kind: p.kind,
    due: p.due,
    hasTime: p.hasTime,
    done: false,
    deleted: false,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };
}

export function updateItem(it: Item, patch: ItemPatch, now: Date): Item {
  return { ...it, ...patch, updatedAt: now.getTime() };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DDTHH:mm' (로컬 시각). */
export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DDTHH:mm' → Date (로컬 시각). */
export function fromLocalIso(s: string): Date {
  return new Date(s);
}
