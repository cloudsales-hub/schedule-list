import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { ItemKind } from '../core/model';
import { parseMemo, splitMemoLines, type ParsedMemo } from '../core/parse';
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
  /** 여러 줄을 붙여넣었을 때 줄마다 해석한 결과. Enter를 누르면 모두 저장한다. */
  const [batch, setBatch] = useState<ParsedMemo[] | null>(null);

  const parsed = parseMemo(value, now());
  const kind: ItemKind = parsed ? (parsed.due ? (override ?? parsed.kind) : 'task') : 'task';

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = splitMemoLines(e.clipboardData.getData('text'));
    if (lines.length < 2) return; // 한 줄이면 평소처럼 입력칸에 붙여넣는다
    e.preventDefault();
    const at = now();
    setBatch(lines.map((l) => parseMemo(l, at)).filter((m): m is ParsedMemo => m !== null));
    setValue('');
    setOverride(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (batch && e.key === 'Enter') {
      e.preventDefault();
      for (const m of batch) void store.add({ text: m.text, kind: m.kind, due: m.due, hasTime: m.hasTime });
      setBatch(null);
      onDone?.();
      return;
    }
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
        aria-label="메모"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onPaste={onPaste}
        onChange={(e) => {
          setBatch(null);
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
      {batch && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div style={{ color: color.blue, marginBottom: 2 }}>{batch.length}개 메모로 나눕니다 · Enter로 모두 저장, Esc로 취소</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: 150, overflowY: 'auto' }}>
            {batch.map((m, i) => (
              <li key={i} style={{ padding: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.kind === 'event' ? '🗓' : m.due ? '🔥' : '📝'} {m.text}
                {m.label && <span style={{ color: color.sub }}> · {m.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!batch && parsed && (
        <div style={{ marginTop: 4, fontSize: 11, color: color.sub }}>
          {previewText(kind, parsed.label)}
          {parsed.due ? ' · Tab으로 종류 바꾸기' : ''}
        </div>
      )}
    </div>
  );
}
