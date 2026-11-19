import type { Item } from '../core/model';
import { toLocalIso } from '../core/model';

export interface DueLabel {
  text: string;
  overdue: boolean;
}

const dayKey = (d: Date) => toLocalIso(d).slice(0, 10);

/** 마감 라벨: `오늘 17:00`, `내일`, `11/27`. 시간이 없는 마감은 그 날이 끝나야 지난 것으로 본다. */
export function dueLabel(it: Item, now: Date): DueLabel | null {
  if (!it.due) return null;
  const day = it.due.slice(0, 10);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const time = it.hasTime ? it.due.slice(11, 16) : null;
  const overdue = it.hasTime ? it.due < toLocalIso(now) : day < today;

  let base: string;
  if (day === today) base = '오늘';
  else if (day === tomorrow) base = '내일';
  else base = `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  return { text: time ? (base.includes('/') ? base : `${base} ${time}`) : base, overdue };
}
