import { useState } from 'react';
import type { Item, ItemKind, ItemPatch } from '../core/model';
import type { ItemsStore } from '../core/store';
import { dueLabel } from './dueLabel';
import { color, ellipsis } from './styles';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 일정 카드에 보이는 날짜·시각. 예: `11/24(화) 15:00` */
function eventWhen(it: Item): string {
  if (!it.due) return '';
  const d = new Date(it.due);
  const date = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  return it.hasTime ? `${date} ${it.due.slice(11, 16)}` : date;
}

const iconButton = { background: 'transparent', border: 'none', color: color.sub, cursor: 'pointer', fontSize: 13 };
const field = {
  background: color.bg,
  color: color.text,
  border: `1px solid ${color.line}`,
  borderRadius: 6,
  padding: '3px 6px',
  fontSize: 12,
};

function EditForm({ item, onSave, onCancel }: { item: Item; onSave(p: ItemPatch): void; onCancel(): void }) {
  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState<ItemKind>(item.kind);
  const [date, setDate] = useState(item.due ? item.due.slice(0, 10) : '');
  const [time, setTime] = useState(item.due && item.hasTime ? item.due.slice(11, 16) : '');

  const needsDate = kind === 'event' && !date;
  const canSave = text.trim() !== '' && !needsDate;
  const save = () =>
    onSave({
      text: text.trim(),
      kind,
      due: date ? `${date}T${time || '00:00'}` : null,
      hasTime: Boolean(date && time),
    });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0' }}>
      <label style={{ fontSize: 11, color: color.sub }}>
        내용 <input aria-label="내용" value={text} onChange={(e) => setText(e.target.value)} style={{ ...field, width: 160 }} />
      </label>
      <label style={{ fontSize: 11, color: color.sub }}>
        종류{' '}
        <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} style={field}>
          <option value="task">할일</option>
          <option value="event">일정</option>
        </select>
      </label>
      <label style={{ fontSize: 11, color: color.sub }}>
        날짜 <input aria-label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
      </label>
      <label style={{ fontSize: 11, color: color.sub }}>
        시간 <input aria-label="시간" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
      </label>
      <button onClick={save} disabled={!canSave} title={needsDate ? '일정은 날짜가 필요합니다' : undefined} style={{ ...field, cursor: canSave ? 'pointer' : 'not-allowed' }}>
        저장
      </button>
      <button onClick={onCancel} style={{ ...field, cursor: 'pointer' }}>
        취소
      </button>
    </div>
  );
}

interface Props {
  item: Item;
  store: ItemsStore;
  now: Date;
  /** 일정 카드에서는 날짜·시각을 보여 준다 */
  showWhen?: boolean;
}

/** 대시보드의 한 줄: 체크, 내용, 마감, 수정, 삭제. */
export function ItemRow({ item, store, now, showWhen }: Props) {
  const [editing, setEditing] = useState(false);
  const label = dueLabel(item, now);

  return (
    <li data-testid="row" style={{ fontSize: 13, borderBottom: `1px solid ${color.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <input type="checkbox" checked={false} aria-label={`${item.text} 완료`} onChange={() => void store.update(item.id, { done: true })} />
        <span style={{ ...ellipsis, flex: 1, minWidth: 0 }}>{item.text}</span>
        {showWhen ? (
          <span style={{ fontSize: 11, color: color.sub, flexShrink: 0 }}>{eventWhen(item)}</span>
        ) : (
          label && (
            <span data-overdue={String(label.overdue)} style={{ fontSize: 11, flexShrink: 0, color: label.overdue ? color.red : color.sub }}>
              {label.text}
            </span>
          )
        )}
        <button aria-label="수정" onClick={() => setEditing((v) => !v)} style={iconButton}>
          ✎
        </button>
        <button aria-label="삭제" onClick={() => void store.remove(item.id)} style={iconButton}>
          🗑
        </button>
      </div>
      {editing && (
        <EditForm
          item={item}
          onCancel={() => setEditing(false)}
          onSave={(p) => {
            void store.update(item.id, p);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}
