import { useState, type KeyboardEvent } from 'react';
import type { ItemKind } from '../core/model';
import { parseMemo } from '../core/parse';
import type { ItemsStore } from '../core/store';
import { color } from './styles';

interface Props {
  store: ItemsStore;
  now: () => Date;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

function previewText(kind: ItemKind, label: string | null): string {
  if (kind === 'event') return `🗓 일정${label ? ` · ${label}` : ''}`;
  return label ? `인식됨 → 🔥 할일 · 마감 ${label}` : '📝 할일 (마감 없음)';
}

/** 한 줄 메모 입력. Enter 저장, Tab 일정↔할일 전환, Esc 닫기. */
export function MemoInput({ store, now, onDone, autoFocus, placeholder = '＋ 메모 입력 후 Enter' }: Props) {
  const [value, setValue] = useState('');
  const [override, setOverride] = useState<ItemKind | null>(null);

  const parsed = parseMemo(value, now());
  const kind: ItemKind = parsed ? (parsed.due ? (override ?? parsed.kind) : 'task') : 'task';

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone?.();
    } else if (e.key === 'Tab') {
      // 마감이 없으면 일정이 될 수 없으므로 전환하지 않는다.
      if (parsed?.due) {
        e.preventDefault();
        setOverride(kind === 'event' ? 'task' : 'event');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!parsed) {
        onDone?.(); // 빈 입력은 저장 없이 닫는다
        return;
      }
      void store.add({ text: parsed.text, kind, due: parsed.due, hasTime: parsed.hasTime });
      setValue('');
      setOverride(null);
      onDone?.();
    }
  };

  return (
    <div>
      <input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setOverride(null);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: color.bg,
          color: color.text,
          border: `1px solid ${color.blue}`,
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 13,
          outline: 'none',
        }}
      />
      {parsed && (
        <div style={{ marginTop: 4, fontSize: 11, color: color.sub }}>
          {previewText(kind, parsed.label)}
          {parsed.due ? ' · Tab으로 종류 바꾸기' : ''}
        </div>
      )}
    </div>
  );
}
