import { describe, expect, test } from 'vitest';
import { createAutoHeight, prefFromUserResize, targetHeight } from './autoHeight';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('targetHeight', () => {
  test('직접 정한 높이가 없으면 내용 높이(최대치)에 맞춘다', () => {
    expect(targetHeight({ natural: 400, pref: null, screenMax: 900 })).toBe(400);
  });
  test('직접 정한 높이가 최대치보다 작으면 그 높이를 지킨다(내용은 스크롤)', () => {
    expect(targetHeight({ natural: 700, pref: 300, screenMax: 900 })).toBe(300);
  });
  test('내용이 줄어 직접 정한 높이가 최대치보다 커지면 최대치로 줄인다', () => {
    expect(targetHeight({ natural: 250, pref: 500, screenMax: 900 })).toBe(250);
  });
  test('내용이 화면보다 커도 화면 높이를 넘지 않는다', () => {
    expect(targetHeight({ natural: 2000, pref: null, screenMax: 900 })).toBe(900);
  });
  test('너무 작게 줄일 수 없다', () => {
    expect(targetHeight({ natural: 700, pref: 50, screenMax: 900 })).toBe(180);
  });
});

describe('prefFromUserResize', () => {
  test('최대치까지 늘렸으면 직접 정한 높이를 지우고 내용을 따라가게 한다', () => {
    expect(prefFromUserResize({ height: 400, natural: 400, screenMax: 900 })).toBeNull();
  });
  test('최대치보다 작게 줄였으면 그 높이를 기억한다', () => {
    expect(prefFromUserResize({ height: 320, natural: 700, screenMax: 900 })).toBe(320);
  });
});

describe('createAutoHeight', () => {
  function make(init: { natural: number; win: number; pref?: number | null; screenMax?: number }) {
    const s = {
      natural: init.natural,
      win: init.win,
      pref: init.pref ?? null,
      sets: [] as number[],
      maxes: [] as number[],
    };
    const run = createAutoHeight({
      measureNatural: () => s.natural,
      screenMax: () => init.screenMax ?? 900,
      getHeight: async () => {
        await tick();
        return s.win;
      },
      setHeight: async (h) => {
        s.sets.push(h);
        s.win = h;
      },
      setMaxHeight: async (h) => void s.maxes.push(h),
      loadPref: () => s.pref,
      savePref: (p) => void (s.pref = p),
    });
    return { s, ...run };
  }

  test('측정이 연달아 들어와도 마지막으로 잰 높이로 끝난다', async () => {
    const { s, fit } = make({ natural: 200, win: 520 });
    const first = fit();
    s.natural = 340;
    const second = fit();
    await Promise.all([first, second]);
    expect(s.win).toBe(340);
  });

  test('창이 내용보다 작으면 같은 높이를 또 재도 다시 맞춘다', async () => {
    const { s, fit } = make({ natural: 340, win: 225 });
    await fit();
    expect(s.win).toBe(340);
  });

  test('내용이 늘어도 사용자가 줄여 둔 높이는 유지하고, 늘릴 수 있는 한도는 내용 높이로 건다', async () => {
    const { s, fit, userResized } = make({ natural: 300, win: 300 });
    await fit();
    await userResized(220);
    s.natural = 600;
    await fit();
    expect(s.win).toBe(220);
    expect(s.maxes[s.maxes.length - 1]).toBe(600);
    expect(s.pref).toBe(220);
  });

  test('사용자가 최대치까지 늘리면 이후에는 내용을 따라 커진다', async () => {
    const { s, fit, userResized } = make({ natural: 500, win: 500, pref: 300 });
    await userResized(500);
    expect(s.pref).toBeNull();
    s.natural = 560;
    await fit();
    expect(s.win).toBe(560);
  });

  test('이미 맞으면 크기를 바꾸지 않고, 너무 작은 측정값은 무시한다', async () => {
    const same = make({ natural: 300, win: 300 });
    await same.fit();
    const tiny = make({ natural: 10, win: 300 });
    await tiny.fit();
    expect(same.s.sets).toEqual([]);
    expect(tiny.s.sets).toEqual([]);
  });

  test('창 크기를 못 바꿔도 오류를 던지지 않는다', async () => {
    const run = createAutoHeight({
      measureNatural: () => 300,
      screenMax: () => 900,
      getHeight: async () => 100,
      setHeight: async () => {
        throw new Error('fail');
      },
      setMaxHeight: async () => {},
      loadPref: () => null,
      savePref: () => {},
    });
    await expect(run.fit()).resolves.toBeUndefined();
  });
});
