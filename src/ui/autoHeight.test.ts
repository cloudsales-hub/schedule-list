import { describe, expect, test } from 'vitest';
import { createAutoHeight } from './autoHeight';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createAutoHeight', () => {
  test('측정이 연달아 들어와도 마지막으로 잰 높이로 끝난다', async () => {
    let content = 200;
    let win = 520;
    const sets: number[] = [];
    const run = createAutoHeight({
      measure: () => content,
      getHeight: async () => {
        await tick(); // 창 크기를 읽는 데 시간이 걸린다
        return win;
      },
      setHeight: async (h) => {
        sets.push(h);
        win = h;
      },
    });
    const first = run();
    content = 340; // 데이터가 불러와져 내용이 커졌다
    const second = run();
    await Promise.all([first, second]);
    expect(win).toBe(340);
    expect(sets[sets.length - 1]).toBe(340);
  });

  test('창이 내용보다 작으면 같은 높이를 또 재도 다시 맞춘다', async () => {
    let win = 225; // 저장돼 있던 작은 크기가 뒤늦게 적용된 상태
    const run = createAutoHeight({
      measure: () => 340,
      getHeight: async () => win,
      setHeight: async (h) => {
        win = h;
      },
    });
    await run();
    expect(win).toBe(340);
  });

  test('이미 맞으면 크기를 바꾸지 않고, 너무 작은 측정값은 무시한다', async () => {
    let calls = 0;
    const same = createAutoHeight({ measure: () => 300, getHeight: async () => 300, setHeight: async () => void calls++ });
    await same();
    const tiny = createAutoHeight({ measure: () => 10, getHeight: async () => 300, setHeight: async () => void calls++ });
    await tiny();
    expect(calls).toBe(0);
  });

  test('창 크기를 못 바꿔도 오류를 던지지 않는다', async () => {
    const run = createAutoHeight({
      measure: () => 300,
      getHeight: async () => 100,
      setHeight: async () => {
        throw new Error('fail');
      },
    });
    await expect(run()).resolves.toBeUndefined();
  });
});
