import { useEffect, useReducer } from 'react';
import type { ItemsStore } from '../core/store';

/** 저장소가 바뀔 때마다 화면을 다시 그린다. */
export function useStore(store: ItemsStore): ItemsStore {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store.subscribe(bump), [store]);
  return store;
}
