import { useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import type { Item, ItemPatch } from '../core/model';
import { doneToday, isUrgentTask, plainTodos, upcomingEvents, urgentTasks } from '../core/selectors';
import type { ItemsStore } from '../core/store';
import { DoneBadge, DoneToggle } from './DoneToggle';
import { dueLabel } from './dueLabel';
import { MemoInput } from './MemoInput';
import { color, ellipsis, font } from './styles';
import { useNow } from './useNow';
import { useStore } from './useStore';

interface Props {
  store: ItemsStore;
  hotkeyLabel: string;
  /** 단축키 등록 실패 같은 안내 문구 */
  notice?: string | null;
  /** 위젯을 눌렀을 때 다른 창 뒤에 가려져 있으면 맨 앞으로 올려 달라는 요청 */
  onRaise?(): void;
  onOpenQuick(): void;
  onOpenSettings(): void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const stop = (e: MouseEvent) => e.stopPropagation();

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const ICON = '#e0e0e0'; // 어두운 바탕에서도 또렷하게 보이는 아이콘 색

const iconButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: ICON,
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  padding: 4,
  borderRadius: 6,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};

/** 급한 것↔할일 이동 버튼: 글자가 있어 눈에 잘 띈다. */
const moveButton: CSSProperties = {
  ...iconButton,
  border: '1px solid rgba(255,255,255,0.35)',
  fontSize: 11,
  padding: '2px 6px',
  whiteSpace: 'nowrap',
};

/** X 모양 삭제 버튼. 마우스를 올리면 빨갛게 바뀐다. */
function DeleteButton({ onClick }: { onClick(e: MouseEvent): void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      aria-label="삭제"
      title="삭제"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...iconButton, color: hover ? color.red : ICON, background: hover ? 'rgba(255,107,107,0.18)' : 'transparent' }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}

interface RowProps {
  item: Item;
  store: ItemsStore;
  now: Date;
  index?: number | null;
  /** 지금 끌고 있는 항목 */
  dragging: Item | null;
  canDropOn(target: Item): boolean;
  onDragStartItem(id: string): void;
  onDragEndItem(): void;
  /** 끌어 온 항목을 이 행 위에 놓았다(이 행 앞으로 들어간다) */
  onDropOnto(draggedId: string, target: Item): void;
  /** 급한 것↔할일 버튼 */
  onMove(item: Item, target: 'urgent' | 'todo'): void;
}

function Row({ item, store, now, index, dragging, canDropOn, onDragStartItem, onDragEndItem, onDropOnto, onMove }: RowProps) {
  const [over, setOver] = useState(false);
  const label = dueLabel(item, now);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  // 완료한 항목은 끌 수 없다. 일정은 일정끼리만, 할일은 급한 것·할일 사이에서 옮기거나 순서를 바꾼다.
  const canDrag = !item.done;
  const canMove = !item.done && item.kind === 'task';
  const inUrgent = isUrgentTask(item); // 지금 급한 것 칸에 있는지(마감이 있어 저절로 들어간 것 포함)

  const startEdit = () => {
    setDraft(item.text);
    setEditing(true);
  };
  // 글자가 바뀌었고 비어 있지 않을 때만 저장한다. 비워 두면 원래 글을 유지한다.
  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next !== '' && next !== item.text) void store.update(item.id, { text: next });
  };

  return (
    <li
      data-testid="row"
      draggable={canDrag && !editing}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStartItem(item.id);
      }}
      onDragEnd={() => {
        setOver(false);
        onDragEndItem();
      }}
      onDragOver={(e: DragEvent) => {
        if (!dragging || !canDropOn(item)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        e.preventDefault();
        e.stopPropagation(); // 칸 전체(맨 끝으로 보내기)가 아니라 이 행 앞으로 넣는다
        onDropOnto(id, item);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontSize: 13,
        boxShadow: over ? `0 -2px 0 0 ${color.blue}` : 'none', // 놓을 자리를 보여 주는 파란 줄
      }}
    >
      {index !== undefined && (
        <span data-testid={index === null ? undefined : 'row-number'} style={{ width: 16, flexShrink: 0, textAlign: 'right', fontSize: 11, color: color.sub }}>
          {index}
        </span>
      )}
      <DoneToggle
        done={item.done}
        label={`${item.text} ${item.done ? '완료 취소' : '완료'}`}
        onToggle={() => void store.update(item.id, { done: !item.done })}
      />
      {editing ? (
        <input
          autoFocus
          aria-label="메모 고치기"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: color.bg,
            color: color.text,
            border: `1px solid ${color.blue}`,
            borderRadius: 6,
            padding: '2px 6px',
            fontSize: 13,
            outline: 'none',
          }}
        />
      ) : (
        <span
          title="눌러서 고치기"
          onClick={startEdit}
          style={{
            ...ellipsis,
            flex: 1,
            minWidth: 0,
            cursor: 'text',
            ...(item.done ? { textDecoration: 'line-through', color: color.sub } : {}),
          }}
        >
          {item.text}
        </span>
      )}
      {item.done ? (
        <DoneBadge />
      ) : (
        label && (
        <span
          data-overdue={String(label.overdue)}
          style={{ fontSize: 11, flexShrink: 0, color: label.overdue ? color.red : color.sub }}
        >
          {label.text}
        </span>
        )
      )}
      {canMove && !inUrgent && (
        <button
          aria-label={`${item.text} 급한 것으로 올리기`}
          title="급한 것으로 올리기"
          onClick={(e) => {
            stop(e);
            onMove(item, 'urgent');
          }}
          style={moveButton}
        >
          🔥 급함
        </button>
      )}
      {canMove && inUrgent && (
        <button
          aria-label={`${item.text} 급한 것에서 내리기`}
          title="할일로 내리기"
          onClick={(e) => {
            stop(e);
            onMove(item, 'todo');
          }}
          style={moveButton}
        >
          ⬇ 할일
        </button>
      )}
      <DeleteButton
        onClick={(e) => {
          stop(e);
          void store.remove(item.id);
        }}
      />
    </li>
  );
}

/** 끌어 온 항목을 놓을 수 있는 칸. 위에 올리면 점선 테두리가 보인다. */
function Zone({ testId, onDropId, children }: { testId: string; onDropId(id: string): void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid={testId}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDropId(id);
      }}
      style={{
        minHeight: 28,
        borderRadius: 8,
        outline: over ? `2px dashed ${color.blue}` : '2px dashed transparent',
        outlineOffset: 2,
      }}
    >
      {children}
    </div>
  );
}

/** 완료하지 않은 항목에만 1부터 번호를 붙이고, 완료한 항목은 번호 칸만 비워 둔다. */
function withNumbers(list: Item[]): { it: Item; n: number | null }[] {
  let n = 0;
  return list.map((it) => ({ it, n: it.done ? null : ++n }));
}

export function Widget({ store, hotkeyLabel, notice, onRaise, onOpenQuick, onOpenSettings }: Props) {
  useStore(store);
  const now = useNow();
  const urgent = urgentTasks(store.items, now);
  const todos = plainTodos(store.items);
  // 오늘 완료한 항목은 각 목록 맨 아래에 남긴다(자정이 지나면 사라진다).
  const doneTasks = doneToday(store.items, now).filter((i) => i.kind === 'task');
  const eventsActive = upcomingEvents(store.items, now).filter((i) => !i.done);
  const eventsShown = [...eventsActive, ...doneToday(store.items, now).filter((i) => i.kind === 'event')];
  const isUrgent = isUrgentTask;
  const urgentShown = withNumbers([...urgent, ...doneTasks.filter(isUrgent)]);
  const todosShown = withNumbers([...todos, ...doneTasks.filter((i) => !isUrgent(i))]);

  const [dragId, setDragId] = useState<string | null>(null);
  const dragging = dragId ? (store.items.find((i) => i.id === dragId) ?? null) : null;

  type ListKey = 'event' | 'urgent' | 'todo';
  const lists: Record<ListKey, Item[]> = { event: eventsActive, urgent, todo: todos };

  /**
   * dragged를 key 목록의 beforeId 항목 앞(null이면 맨 끝)에 넣는다. 다른 칸이면 급한 것/할일도 함께 바꾼다.
   * 그 목록의 모든 항목에 1000, 2000, … 순번을 새로 주고, 바뀐 것만 한 번에 저장한다.
   */
  const place = (dragged: Item, key: ListKey, beforeId: string | null) => {
    if (dragged.done || dragged.deleted) return;
    if ((dragged.kind === 'event') !== (key === 'event')) return; // 일정은 일정 칸에서만 움직인다
    const base = lists[key].filter((i) => i.id !== dragged.id);
    const at = beforeId === null ? base.length : base.findIndex((i) => i.id === beforeId);
    if (at < 0) return;
    const next = [...base.slice(0, at), dragged, ...base.slice(at)];
    const sameList = lists[key].some((i) => i.id === dragged.id);
    if (sameList && next.every((it, i) => it.id === lists[key][i].id)) return; // 순서가 그대로면 저장하지 않는다
    const changes: { id: string; patch: ItemPatch }[] = [];
    next.forEach((it, i) => {
      const patch: ItemPatch = {};
      if (it.order !== (i + 1) * 1000) patch.order = (i + 1) * 1000;
      if (it.id === dragged.id && key !== 'event' && !sameList) patch.urgent = key === 'urgent';
      if (Object.keys(patch).length > 0) changes.push({ id: it.id, patch });
    });
    if (changes.length > 0) void store.updateMany(changes);
  };

  const keyOf = (it: Item): ListKey => (it.kind === 'event' ? 'event' : isUrgent(it) ? 'urgent' : 'todo');
  const dropOnZone = (id: string, key: ListKey) => {
    const it = store.items.find((i) => i.id === id);
    if (it) place(it, key, null);
  };
  const rowProps = {
    store,
    now,
    dragging,
    canDropOn: (t: Item) =>
      !!dragging && !dragging.done && !t.done && dragging.id !== t.id && (dragging.kind === 'event') === (t.kind === 'event'),
    onDragStartItem: setDragId,
    onDragEndItem: () => setDragId(null),
    onDropOnto: (id: string, target: Item) => {
      const it = store.items.find((i) => i.id === id);
      if (it && !target.done) place(it, keyOf(target), target.id);
    },
    onMove: (it: Item, target: 'urgent' | 'todo') => place(it, target, null),
  };

  return (
    <div
      data-testid="widget-root"
      onMouseDown={() => onRaise?.()}
      style={{
        boxSizing: 'border-box',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 14,
        background: '#262629', // 검은 배경 위에서도 보이도록 한 단계 밝은 바탕과 밝은 테두리
        border: '1.5px solid rgba(255,255,255,0.45)',
        color: color.text,
        fontFamily: font,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div data-testid="widget-top" style={{ flexShrink: 0 }}>
      {notice && (
        <div role="status" style={{ marginBottom: 8, fontSize: 12, color: color.red }}>
          {notice}
        </div>
      )}
      {store.status === 'error' && store.error && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: color.red }}>
          {store.error}
        </div>
      )}

      <div
        data-tauri-drag-region
        data-testid="drag-handle"
        onClick={stop}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, cursor: 'move' }}
      >
        <strong style={{ fontSize: 15, flex: 1, pointerEvents: 'none' }} title="끌어서 위치 옮기기">
          ⠿ {now.getMonth() + 1}월 {now.getDate()}일 ({WEEKDAYS[now.getDay()]})
        </strong>
        <button
          aria-label="설정"
          title="설정"
          onClick={(e) => {
            stop(e);
            onOpenSettings();
          }}
          style={{ background: 'transparent', border: 'none', color: color.sub, cursor: 'pointer', fontSize: 15, padding: '0 8px' }}
        >
          ⚙
        </button>
        <button
          onClick={(e) => {
            stop(e);
            onOpenQuick();
          }}
          style={{
            background: 'transparent',
            color: color.text,
            border: `1px solid ${color.sub}`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ＋ 메모 <span style={{ color: color.sub }}>{hotkeyLabel}</span>
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <MemoInput store={store} now={() => new Date()} />
      </div>
      </div>

      {/* 창이 내용보다 낮으면 이 칸만 스크롤된다(목록 전체를 마우스 휠이나 스크롤바로 본다). */}
      <div
        data-testid="scroll-area"
        style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingRight: 10 /* 스크롤바와 삭제 버튼이 겹치지 않게 */ }}
      >
      <div data-testid="widget-content">
      {eventsShown.length > 0 && (
        <Zone testId="event-zone" onDropId={(id) => dropOnZone(id, 'event')}>
          <h3 style={{ fontSize: 12, color: color.sub, margin: '8px 0 4px' }}>🗓 일정</h3>
          <ul data-testid="event-list" style={listStyle}>
            {eventsShown.map((it) => (
              <Row key={it.id} item={it} {...rowProps} />
            ))}
          </ul>
        </Zone>
      )}

      <Zone testId="urgent-zone" onDropId={(id) => dropOnZone(id, 'urgent')}>
        <h3 style={{ fontSize: 12, color: color.sub, margin: '8px 0 4px' }}>🔥 급한 것</h3>
        <ul data-testid="urgent-list" style={listStyle}>
          {urgentShown.map(({ it, n }) => (
            <Row key={it.id} item={it} {...rowProps} index={n} />
          ))}
        </ul>
      </Zone>

      <Zone testId="todo-zone" onDropId={(id) => dropOnZone(id, 'todo')}>
        <h3 style={{ fontSize: 12, color: color.sub, margin: '12px 0 4px' }}>📝 할일 ({todos.length})</h3>
        <ul data-testid="todo-list" style={listStyle}>
          {todosShown.map(({ it, n }) => (
            <Row key={it.id} item={it} {...rowProps} index={n} />
          ))}
        </ul>
      </Zone>
      </div>
      </div>

    </div>
  );
}
