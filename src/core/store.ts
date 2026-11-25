import type { Item, ItemPatch, NewItem } from './model';
import { createItem, updateItem } from './model';
import { mergeItems, parseDataFile, purgeDeleted, serializeDataFile } from './merge';

/** 데이터 파일 저장소. 실제 앱은 Tauri 명령으로, 테스트는 메모리로 구현한다. */
export interface Backend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  /** 깨진 파일을 지우지 않고 보관한다. 끝나면 원래 경로는 비어 있다. */
  backupCorrupt(): Promise<void>;
  /** 다른 PC(또는 OneDrive)가 파일을 바꿨을 때 알려 준다. 해제 함수를 돌려준다. */
  onChanged(cb: () => void): () => void;
}

export type StoreStatus = 'loading' | 'ready' | 'error';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 항상 같은 순서로 저장해서 내용이 같으면 파일도 같게 한다. */
function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 변경할 때마다 파일을 다시 읽어 병합한 뒤 저장하므로, 다른 PC가 방금 쓴 항목을 덮어쓰지 않는다.
 * 모든 작업은 한 줄로 차례대로 실행된다.
 */
export class ItemsStore {
  items: Item[] = [];
  status: StoreStatus = 'loading';
  error: string | null = null;

  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private unlisten: (() => void) | null = null;

  constructor(
    private backend: Backend,
    private now: () => Date = () => new Date(),
  ) {}

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** 지금까지 요청한 작업이 모두 끝날 때까지 기다린다. */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  dispose(): void {
    this.unlisten?.();
    this.unlisten = null;
  }

  load(): Promise<void> {
    if (!this.unlisten) {
      this.unlisten = this.backend.onChanged(() => {
        void this.enqueue(() => this.sync());
      });
    }
    return this.enqueue(() => this.sync());
  }

  add(p: NewItem): Promise<void> {
    return this.enqueue(() => this.sync((items) => [...items, createItem(p, this.now())]));
  }

  update(id: string, patch: ItemPatch): Promise<void> {
    return this.enqueue(() =>
      this.sync((items) => items.map((it) => (it.id === id ? updateItem(it, patch, this.now()) : it))),
    );
  }

  /** 여러 항목을 한 번에 고친다. 파일은 한 번만 읽고 쓴다. */
  updateMany(changes: { id: string; patch: ItemPatch }[]): Promise<void> {
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    return this.enqueue(() =>
      this.sync((items) => items.map((it) => (byId.has(it.id) ? updateItem(it, byId.get(it.id)!, this.now()) : it))),
    );
  }

  /** 삭제 표시만 한다. 실제 정리는 30일 뒤에 병합 과정에서 이루어진다. */
  remove(id: string): Promise<void> {
    return this.update(id, { deleted: true });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  private fail(message: string): void {
    this.status = 'error';
    this.error = message;
    this.notify();
  }

  private async sync(mutate?: (items: Item[]) => Item[]): Promise<void> {
    let text: string | null;
    try {
      text = await this.backend.read();
    } catch (e) {
      // 파일을 읽지 못한 채 저장하면 다른 PC의 항목을 덮어쓸 수 있으므로 저장하지 않는다.
      if (mutate) this.items = mutate(this.items);
      this.fail(`데이터를 불러오지 못했습니다: ${errorText(e)}`);
      return;
    }

    let remote: Item[] = [];
    const loaded = parseDataFile(text);
    if (loaded.ok) {
      remote = loaded.data.items;
    } else if (loaded.reason === 'corrupt') {
      try {
        await this.backend.backupCorrupt();
      } catch (e) {
        this.fail(`깨진 데이터 파일을 보관하지 못했습니다: ${errorText(e)}`);
        return;
      }
    }

    let merged = mergeItems(this.items, remote);
    if (mutate) merged = mutate(merged);
    merged = sortItems(purgeDeleted(merged, this.now()));
    this.items = merged; // 저장에 실패해도 메모리에는 남겨 다음에 다시 저장한다

    const out = serializeDataFile(merged);
    if (out !== text) {
      try {
        await this.backend.write(out);
      } catch (e) {
        this.fail(`데이터 파일을 저장하지 못했습니다: ${errorText(e)}`);
        return;
      }
    }
    this.status = 'ready';
    this.error = null;
    this.notify();
  }
}
