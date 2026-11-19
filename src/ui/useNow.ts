import { useEffect, useState } from 'react';

/** 지금 시각. tickMs마다 갱신되어 자정이 지나면 "내일" 같은 라벨이 저절로 바뀐다. */
export function useNow(tickMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
