import type { Item } from './model';
import { toLocalIso } from './model';

/** 완료되지 않았고 삭제되지 않은 항목. */
const active = (it: Item) => !it.done && !it.deleted;

const byDue = (a: Item, b: Item) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0);

/** 급한 것에 들어가는 할일인가: 마감이 있거나, 직접 급함 표시를 한 것. */
const isUrgentTask = (i: Item) => i.kind === 'task' && (i.due !== null || i.urgent === true);

/** 급한 것 목록 순서: 급함 표시만 있는 것(만든 순서)이 먼저, 그다음 마감 빠른 순. */
const urgentOrder = (a: Item, b: Item) => {
  if (a.due === null && b.due === null) return a.createdAt - b.createdAt;
  if (a.due === null) return -1;
  if (b.due === null) return 1;
  return byDue(a, b);
};

/** 급한 할일: 마감이 있거나 급함 표시를 한 할일. 이미 지난 것도 포함한다. */
export function urgentTasks(items: Item[], _now: Date): Item[] {
  return items.filter((i) => active(i) && isUrgentTask(i)).sort(urgentOrder);
}

/** urgentTasks 중 마감이 (오늘 + 7일) 끝 이전인 것. */
export function soonTasks(items: Item[], now: Date): Item[] {
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59);
  const limitIso = toLocalIso(limit);
  return urgentTasks(items, now).filter((i) => i.due !== null && i.due <= limitIso);
}

/** 마감도 급함 표시도 없는 할일, 만든 순서(오래된 것 먼저). */
export function plainTodos(items: Item[]): Item[] {
  return items
    .filter((i) => active(i) && i.kind === 'task' && !isUrgentTask(i))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 오늘 0시 이후의 일정, 빠른 순. */
export function upcomingEvents(items: Item[], now: Date, limit?: number): Item[] {
  const startIso = toLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const list = items
    .filter((i) => active(i) && i.kind === 'event' && i.due !== null && i.due >= startIso)
    .sort(byDue);
  return limit === undefined ? list : list.slice(0, limit);
}

/** 해당 월에 일정이나 마감이 있는 날(일). month는 1~12. */
export function markedDays(items: Item[], year: number, month: number): Set<number> {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const days = new Set<number>();
  for (const i of items) {
    if (active(i) && i.due !== null && i.due.startsWith(prefix)) {
      days.add(Number(i.due.slice(8, 10)));
    }
  }
  return days;
}

/** 오늘 0시 이후에 완료한 항목, 완료한 순서. 자정이 지나면 저절로 빠진다. 완료 시각은 수정 시각(updatedAt)을 쓴다. */
export function doneToday(items: Item[], now: Date): Item[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.filter((i) => i.done && !i.deleted && i.updatedAt >= start).sort((a, b) => a.updatedAt - b.updatedAt);
}
