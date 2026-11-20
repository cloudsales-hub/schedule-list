const MIN_HEIGHT = 80;

interface Deps {
  /** 위젯 내용의 높이(논리 픽셀) */
  measure(): number;
  /** 지금 창의 높이(논리 픽셀) */
  getHeight(): Promise<number>;
  setHeight(height: number): Promise<void>;
}

/**
 * 창 높이를 내용에 맞추는 함수를 만든다.
 * 한 번에 하나씩만 돌고, 도는 중에 다시 불리면 끝난 뒤 한 번 더 돌아 항상 마지막 측정값으로 끝난다.
 * 직전에 맞춘 값을 기억하지 않고 실제 창 높이와 비교하므로, 창 크기가 뒤늦게 다른 값으로 바뀌어도 다시 맞춘다.
 */
export function createAutoHeight({ measure, getHeight, setHeight }: Deps): () => Promise<void> {
  let running = false;
  let again = false;
  return async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const height = Math.ceil(measure());
        if (height < MIN_HEIGHT) continue;
        try {
          if ((await getHeight()) !== height) await setHeight(height);
        } catch {
          // 창 크기를 못 바꿔도 위젯 사용에는 지장이 없다.
        }
      } while (again);
    } finally {
      running = false;
    }
  };
}
