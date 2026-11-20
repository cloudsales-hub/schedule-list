const MIN_CONTENT = 80; // 이보다 작은 측정값은 아직 그려지기 전이라고 보고 무시한다
const MIN_HEIGHT = 180; // 사용자가 줄일 수 있는 가장 작은 높이
const SETTLE = 1; // 이 정도(px) 차이는 같은 높이로 본다

interface Limits {
  natural: number;
  screenMax: number;
}

/** 늘릴 수 있는 최대 높이: 내용이 다 보이는 높이. 단 화면보다 크지는 않다. */
function maxHeight({ natural, screenMax }: Limits): number {
  return Math.max(MIN_HEIGHT, Math.min(Math.ceil(natural), screenMax));
}

/** 창이 가져야 할 높이. 직접 정한 높이(pref)가 있으면 최대치 안에서 그 높이를 지킨다. */
export function targetHeight(l: Limits & { pref: number | null }): number {
  const max = maxHeight(l);
  return l.pref === null ? max : Math.min(Math.max(l.pref, MIN_HEIGHT), max);
}

/** 사용자가 창을 끌어 바꾼 높이를 기억할 값으로. 최대치까지 늘렸으면 null(내용을 따라간다). */
export function prefFromUserResize(l: Limits & { height: number }): number | null {
  const max = maxHeight(l);
  return l.height >= max - SETTLE ? null : Math.max(Math.round(l.height), MIN_HEIGHT);
}

interface Deps {
  /** 위젯 내용이 다 보이는 데 필요한 높이(논리 픽셀). 창 높이와 무관하게 잰다. */
  measureNatural(): number;
  /** 화면에서 쓸 수 있는 가장 큰 높이 */
  screenMax(): number;
  /** 지금 창의 높이(논리 픽셀) */
  getHeight(): Promise<number>;
  setHeight(height: number): Promise<void>;
  /** 창을 끌어 늘릴 수 있는 한도를 건다 */
  setMaxHeight(height: number): Promise<void>;
  loadPref(): number | null;
  savePref(pref: number | null): void;
}

/**
 * 위젯 창 높이를 관리한다. 기본은 내용에 딱 맞는 높이(최대치)이고,
 * 사용자가 최대치보다 작게 줄여 두면 그 높이를 지키며 내용은 스크롤로 본다.
 * 한 번에 하나씩만 돌고, 도는 중에 다시 불리면 끝난 뒤 한 번 더 돌아 항상 마지막 측정값으로 끝난다.
 * 직전에 맞춘 값을 기억하지 않고 실제 창 높이와 비교하므로, 창 크기가 뒤늦게 바뀌어도 다시 맞춘다.
 */
export function createAutoHeight(d: Deps) {
  let running = false;
  let again = false;
  let lastMax = -1;

  async function fit(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const natural = d.measureNatural();
        if (natural < MIN_CONTENT) continue;
        const limits = { natural, screenMax: d.screenMax() };
        try {
          const max = maxHeight(limits);
          if (max !== lastMax) {
            await d.setMaxHeight(max);
            lastMax = max;
          }
          const want = targetHeight({ ...limits, pref: d.loadPref() });
          if (Math.abs((await d.getHeight()) - want) > SETTLE) await d.setHeight(want);
        } catch {
          // 창 크기를 못 바꿔도 위젯 사용에는 지장이 없다.
        }
      } while (again);
    } finally {
      running = false;
    }
  }

  /** 사용자가 창 가장자리를 끌어 높이를 바꿨을 때 부른다. */
  async function userResized(height: number): Promise<void> {
    d.savePref(prefFromUserResize({ height, natural: d.measureNatural(), screenMax: d.screenMax() }));
    await fit();
  }

  return { fit, userResized };
}
