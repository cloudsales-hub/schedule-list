import type { ItemKind } from './model';
import { toLocalIso } from './model';

export interface ParsedMemo {
  text: string;
  kind: ItemKind;
  due: string | null;
  hasTime: boolean;
  /** 입력창 미리보기용 문구. 예: "내일(11/21) 오전". 마감을 못 읽으면 null. */
  label: string | null;
}

/** 한국어 표현은 이 표에 모은다. */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DEADLINE_WORDS = /까지|마감/;
const UNREADABLE = /내일\s*모레/g;
const WEEK_PHRASE = /(이번|다음)\s*주\s*([월화수목금토일])(?:요일)?/;
const MONTH_DAY = /(\d{1,2})월\s*(\d{1,2})일/;
const MERIDIEM_TIME = /(오전|오후)\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/;
const CLOCK_TIME = /(\d{1,2}):(\d{2})/;
const PLAIN_TIME = /(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/;
const MERIDIEM_DEADLINE = /(오전|오후)\s*까지/;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

interface DateHit {
  date: Date;
  label: string;
}

function dateLabel(date: Date, today: Date): string {
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return `내일(${md})`;
  if (diff === 2) return `모레(${md})`;
  return `${md}(${WEEKDAYS[date.getDay()]})`;
}

function findDate(src: string, now: Date): DateHit | null {
  const today = startOfDay(now);
  const hit = (date: Date): DateHit => ({ date, label: dateLabel(date, today) });

  const week = WEEK_PHRASE.exec(src);
  if (week) {
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const idx = (WEEKDAYS.indexOf(week[2]) + 6) % 7; // 월=0 … 일=6
    return hit(addDays(monday, idx + (week[1] === '다음' ? 7 : 0)));
  }

  const md = MONTH_DAY.exec(src);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    let candidate = new Date(today.getFullYear(), month - 1, day);
    if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null; // 없는 날짜
    if (candidate < today) candidate = new Date(today.getFullYear() + 1, month - 1, day);
    return hit(candidate);
  }

  if (/모레/.test(src)) return hit(addDays(today, 2));
  if (/내일/.test(src)) return hit(addDays(today, 1));
  if (/오늘/.test(src)) return hit(today);
  return null;
}

interface TimeHit {
  h: number;
  m: number;
  /** 시각 숫자 없이 "오전까지/오후까지"만 쓴 경우 */
  meridiemOnly: boolean;
}

function validTime(h: number, m: number): boolean {
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** 오전/오후 표시가 없을 때: 1~6시는 오후, 7~11시는 오전, 12시는 낮 12시. */
function guessHour(h: number): number {
  return h >= 1 && h <= 6 ? h + 12 : h;
}

function findTime(src: string): TimeHit | null {
  const mer = MERIDIEM_TIME.exec(src);
  if (mer) {
    let h = Number(mer[2]);
    const m = mer[3] ? Number(mer[3]) : 0;
    if (h <= 12) h = mer[1] === '오전' ? h % 12 : (h % 12) + 12;
    return validTime(h, m) ? { h, m, meridiemOnly: false } : null;
  }
  const clock = CLOCK_TIME.exec(src);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    return validTime(h, m) ? { h, m, meridiemOnly: false } : null;
  }
  const plain = PLAIN_TIME.exec(src);
  if (plain) {
    const h = guessHour(Number(plain[1]));
    const m = plain[2] ? Number(plain[2]) : 0;
    return validTime(h, m) ? { h, m, meridiemOnly: false } : null;
  }
  const dl = MERIDIEM_DEADLINE.exec(src);
  if (dl) return { h: dl[1] === '오전' ? 12 : 18, m: 0, meridiemOnly: true };
  return null;
}

function timeLabel(t: TimeHit): string {
  if (t.meridiemOnly) return t.h < 15 ? '오전' : '오후';
  const word = t.h < 12 ? '오전' : '오후';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${word} ${h12}시${t.m ? ` ${t.m}분` : ''}`;
}

export function parseMemo(input: string, now: Date): ParsedMemo | null {
  const text = input.trim();
  if (text === '') return null;

  const src = text.replace(UNREADABLE, ' '); // "내일모레"는 못 읽는 표현으로 취급
  const date = findDate(src, now);
  const time = findTime(src);

  if (!date && !time) {
    return { text, kind: 'task', due: null, hasTime: false, label: null };
  }

  const day = date ? date.date : startOfDay(now);
  const dayLabel = date ? date.label : '오늘';

  if (!time) {
    return { text, kind: 'task', due: `${toLocalIso(day).slice(0, 10)}T00:00`, hasTime: false, label: dayLabel };
  }

  const due = toLocalIso(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m));
  const isDeadline = time.meridiemOnly || DEADLINE_WORDS.test(src);
  return {
    text,
    kind: isDeadline ? 'task' : 'event',
    due,
    hasTime: true,
    label: `${dayLabel} ${timeLabel(time)}`,
  };
}

const LIST_MARKER = /^\s*(?:[-*•·▪]|\d+[.)])\s+/;

/** 여러 줄 글을 메모 한 개씩으로 나눈다. 빈 줄은 버리고 앞의 목록 기호(-, •, 1.)는 뗀다. */
export function splitMemoLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter((line) => line !== '');
}
