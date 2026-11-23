import { useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import type { Item } from '../core/model';
import { doneToday, plainTodos, upcomingEvents, urgentTasks } from '../core/selectors';
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

function Row({ item, store, now, index }: { item: Item; store: ItemsStore; now: Date; index?: number | null }) {
  const label = dueLabel(item, now);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  // 완료한 항목과 일정은 끌 수 없다. 급한 것↔할일로 옮길 수 있는 건 할일뿐이다.
  const canDrag = !item.done && item.kind === 'task';
  const autoUrgent = item.due !== null; // 마감이 있으면 저절로 급한 것

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
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}
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
      {canDrag && !autoUrgent && item.urgent !== true && (
        <button
          aria-label={`${item.text} 급한 것으로 올리기`}
          title="급한 것으로 올리기"
          onClick={(e) => {
            stop(e);
            void store.update(item.id, { urgent: true });
          }}
          style={iconButton}
        >
          🔥
        </button>
      )}
      {canDrag && !autoUrgent && item.urgent === true && (
        <button
          aria-label={`${item.text} 급한 것에서 내리기`}
          title="할일로 내리기"
          onClick={(e) => {
            stop(e);
            void store.update(item.id, { urgent: false });
          }}
          style={iconButton}
        >
          ⬇
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
  const eventsShown = [
    ...upcomingEvents(store.items, now).filter((i) => !i.done),
    ...doneToday(store.items, now).filter((i) => i.kind === 'event'),
  ];
  const isUrgent = (i: Item) => i.due !== null || i.urgent === true;
  const urgentShown = withNumbers([...urgent, ...doneTasks.filter(isUrgent)]);
  const todosShown = withNumbers([...todos, ...doneTasks.filter((i) => !isUrgent(i))]);

  // 할일 → 급한 것: 급함 표시를 붙인다. 급한 것 → 할일: 표시를 푼다(마감이 있는 항목은 마감 때문에 계속 급한 것에 남는다).
  const moveTo = (id: string, target: 'urgent' | 'todo') => {
    const it = store.items.find((i) => i.id === id);
    if (!it || it.done || it.deleted || it.kind !== 'task') return;
    if (target === 'urgent' && !isUrgent(it)) void store.update(id, { urgent: true });
    if (target === 'todo' && it.urgent === true) void store.update(id, { urgent: false });
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
        <>
          <h3 style={{ fontSize: 12, color: color.sub, margin: '8px 0 4px' }}>🗓 일정</h3>
          <ul data-testid="event-list" style={listStyle}>
            {eventsShown.map((it) => (
              <Row key={it.id} item={it} store={store} now={now} />
            ))}
          </ul>
        </>
      )}

      <Zone testId="urgent-zone" onDropId={(id) => moveTo(id, 'urgent')}>
        <h3 style={{ fontSize: 12, color: color.sub, margin: '8px 0 4px' }}>🔥 급한 것</h3>
        <ul data-testid="urgent-list" style={listStyle}>
          {urgentShown.map(({ it, n }) => (
            <Row key={it.id} item={it} store={store} now={now} index={n} />
          ))}
        </ul>
      </Zone>

      <Zone testId="todo-zone" onDropId={(id) => moveTo(id, 'todo')}>
        <h3 style={{ fontSize: 12, color: color.sub, margin: '12px 0 4px' }}>📝 할일 ({todos.length})</h3>
        <ul data-testid="todo-list" style={listStyle}>
          {todosShown.map(({ it, n }) => (
            <Row key={it.id} item={it} store={store} now={now} index={n} />
          ))}
        </ul>
      </Zone>
      </div>
      </div>

    </div>
  );
}
