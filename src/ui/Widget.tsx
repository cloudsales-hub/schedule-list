import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { Item } from '../core/model';
import { doneToday, plainTodos, urgentTasks } from '../core/selectors';
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
  onOpenDashboard(): void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const stop = (e: MouseEvent) => e.stopPropagation();

const listStyle: CSSProperties = {
  overflowY: 'auto',
  maxHeight: 260,
  margin: 0,
  padding: 0,
  paddingRight: 10, // 스크롤바와 삭제 버튼이 겹치지 않게
  listStyle: 'none',
};

function Row({ item, store, now }: { item: Item; store: ItemsStore; now: Date }) {
  const label = dueLabel(item, now);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

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
    <li data-testid="row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
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
      <button
        aria-label="삭제"
        title="삭제"
        onClick={(e) => {
          stop(e);
          void store.remove(item.id);
        }}
        style={{ background: 'transparent', border: 'none', color: color.sub, cursor: 'pointer', fontSize: 12, padding: 0, flexShrink: 0 }}
      >
        🗑
      </button>
    </li>
  );
}

export function Widget({ store, hotkeyLabel, notice, onRaise, onOpenQuick, onOpenDashboard }: Props) {
  useStore(store);
  const now = useNow();
  const urgent = urgentTasks(store.items, now);
  const todos = plainTodos(store.items);
  // 오늘 완료한 항목은 각 목록 맨 아래에 남긴다(자정이 지나면 사라진다).
  const doneTasks = doneToday(store.items, now).filter((i) => i.kind === 'task');
  const urgentShown = [...urgent, ...doneTasks.filter((i) => i.due !== null)];
  const todosShown = [...todos, ...doneTasks.filter((i) => i.due === null)];

  return (
    <div
      data-testid="widget-root"
      onMouseDown={() => onRaise?.()}
      style={{
        boxSizing: 'border-box',
        padding: 14,
        background: color.bg,
        color: color.text,
        fontFamily: font,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div>
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

      <h3 style={{ fontSize: 12, color: color.sub, margin: '8px 0 4px' }}>🔥 급한 것</h3>
      <ul data-testid="urgent-list" style={listStyle}>
        {urgentShown.map((it) => (
          <Row key={it.id} item={it} store={store} now={now} />
        ))}
      </ul>

      <h3 style={{ fontSize: 12, color: color.sub, margin: '12px 0 4px' }}>📝 할일 ({todos.length})</h3>
      <ul data-testid="todo-list" style={{ ...listStyle, maxHeight: 220 }}>
        {todosShown.map((it) => (
          <Row key={it.id} item={it} store={store} now={now} />
        ))}
      </ul>
      </div>

      <button
        onClick={onOpenDashboard}
        style={{
          marginTop: 10,
          width: '100%',
          background: 'transparent',
          color: '#9cc0ff',
          border: `1px solid ${color.blue}`,
          borderRadius: 8,
          padding: '8px 0',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ▦ 대시보드 열기
      </button>
    </div>
  );
}
