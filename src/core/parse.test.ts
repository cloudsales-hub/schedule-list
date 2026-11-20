import { describe, expect, test } from 'vitest';
import { parseMemo, splitMemoLines } from './parse';

// 2026-11-20은 금요일이다.
const now = new Date('2026-11-20T09:00');

describe('parseMemo: 스펙의 대표 입력', () => {
  test('"내일 오전까지"는 내일 12:00 마감인 할일', () => {
    const r = parseMemo('김과장 견적서 다시 확인 — 내일 오전까지', now)!;
    expect(r.text).toBe('김과장 견적서 다시 확인 — 내일 오전까지');
    expect(r.kind).toBe('task');
    expect(r.due).toBe('2026-11-21T12:00');
    expect(r.hasTime).toBe(true);
    expect(r.label).toBe('내일(11/21) 오전');
  });

  test('"내일 3시 회의"는 내일 15:00 일정', () => {
    const r = parseMemo('내일 3시 회의', now)!;
    expect(r.kind).toBe('event');
    expect(r.due).toBe('2026-11-21T15:00');
    expect(r.hasTime).toBe(true);
    expect(r.label).toContain('내일(11/21) 오후');
  });

  test('"모레 오전 10시"는 모레 10:00 일정', () => {
    const r = parseMemo('모레 오전 10시 거래처 통화', now)!;
    expect(r.kind).toBe('event');
    expect(r.due).toBe('2026-11-22T10:00');
  });

  test('"다음 주 수요일"은 11/25 날짜만 있는 할일', () => {
    const r = parseMemo('다음 주 수요일 보고서 제출', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBe('2026-11-25T00:00');
    expect(r.hasTime).toBe(false);
    expect(r.label).toBe('11/25(수)');
  });

  test('"오늘 17시까지"는 오늘 17:00 마감인 할일', () => {
    const r = parseMemo('오늘 17시까지 견적서', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBe('2026-11-20T17:00');
    expect(r.hasTime).toBe(true);
  });

  test('날짜 표현이 없으면 마감 없는 할일', () => {
    const r = parseMemo('박팀장님 요청 자료 나중에 찾아보기', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBeNull();
    expect(r.hasTime).toBe(false);
    expect(r.label).toBeNull();
  });

  test('"11월 27일"은 11/27 날짜만 있는 할일', () => {
    const r = parseMemo('11월 27일 정산 자료', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBe('2026-11-27T00:00');
  });

  test('"오후까지"는 18:00 마감', () => {
    const r = parseMemo('모레 오후까지 계약서 회신', now)!;
    expect(r.due).toBe('2026-11-22T18:00');
    expect(r.label).toBe('모레(11/22) 오후');
  });

  test('앞뒤 공백은 지우고 text로 저장', () => {
    expect(parseMemo('  견적서 확인  ', now)!.text).toBe('견적서 확인');
  });
});

describe('parseMemo: 애매하거나 이상한 입력 (Review Focus 1)', () => {
  test('빈 입력과 공백만 있는 입력은 null', () => {
    expect(parseMemo('', now)).toBeNull();
    expect(parseMemo('   ', now)).toBeNull();
  });

  test('오전/오후 없는 "3시"는 오후 3시, 날짜가 없으면 오늘 일정', () => {
    const r = parseMemo('3시', now)!;
    expect(r.kind).toBe('event');
    expect(r.due).toBe('2026-11-20T15:00');
  });

  test('오전/오후 없는 7~11시는 오전, 12시는 낮 12시', () => {
    expect(parseMemo('내일 7시 출근', now)!.due).toBe('2026-11-21T07:00');
    expect(parseMemo('내일 12시 점심', now)!.due).toBe('2026-11-21T12:00');
  });

  test('불가능한 시각 "25시"는 무시하고 마감 없는 할일', () => {
    const r = parseMemo('25시 회의', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBeNull();
  });

  test('불가능한 시각이 날짜와 함께 있으면 날짜만 쓴다', () => {
    const r = parseMemo('내일 25시 회의', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBe('2026-11-21T00:00');
    expect(r.hasTime).toBe(false);
  });

  test('"내일모레"처럼 못 읽는 표현은 예외 없이 마감 없는 할일', () => {
    const r = parseMemo('내일모레', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBeNull();
  });

  test('"3시간"은 시각이 아니다', () => {
    const r = parseMemo('3시간 걸리는 작업 정리', now)!;
    expect(r.kind).toBe('task');
    expect(r.due).toBeNull();
  });

  test('없는 날짜 "13월 5일"은 무시', () => {
    const r = parseMemo('13월 5일 회의', now)!;
    expect(r.due).toBeNull();
  });
});

describe('splitMemoLines', () => {
  test('줄마다 하나의 메모로 나누고 빈 줄은 버린다', () => {
    expect(splitMemoLines('이즐 - 부산 계약서\r\n\r\n  옴니콘 메일 회신 + 견적  \n나인와트 메일\n')).toEqual([
      '이즐 - 부산 계약서',
      '옴니콘 메일 회신 + 견적',
      '나인와트 메일',
    ]);
  });
  test('목록 기호와 번호는 떼어 낸다', () => {
    expect(splitMemoLines('- 가\n• 나\n* 다\n1. 라\n2) 마\n-하이픈 없는 것')).toEqual(['가', '나', '다', '라', '마', '-하이픈 없는 것']);
  });
  test('한 줄이거나 비어 있으면 한 개 또는 0개', () => {
    expect(splitMemoLines('한 줄\n')).toEqual(['한 줄']);
    expect(splitMemoLines(' \n \n')).toEqual([]);
  });
});
