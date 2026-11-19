import { useState, type ReactNode } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { markedDays, plainTodos, soonTasks, upcomingEvents } from '../core/selectors';
import type { ItemsStore } from '../core/store';
import bannerDefault from '../assets/banner-room.png';
import type { Settings } from './api';
import { Calendar } from './Calendar';
import { Clock } from './Clock';
import { ItemRow } from './ItemRow';
import { MemoInput } from './MemoInput';
import { color, font } from './styles';
import { useNow } from './useNow';
import { useStore } from './useStore';

interface Props {
  store: ItemsStore;
  settings: Settings;
  onOpenSettings(): void;
  /** 값이 있으면 대시보드 위에 겹쳐서 보여 준다(설정 화면). */
  overlay?: ReactNode;
}

/** 사용자가 고른 이미지 파일이 있으면 그 파일을, 없으면 기본 그림을 쓴다. */
function bannerSrc(path: string | null): string {
  if (!path) return bannerDefault;
  try {
    return convertFileSrc(path);
  } catch {
    return bannerDefault;
  }
}

const cardStyle = {
  background: color.card,
  border: `1px solid ${color.line}`,
  borderRadius: 10,
  padding: 14,
  minWidth: 0,
};
const listStyle = { margin: 0, padding: 0, listStyle: 'none', overflowY: 'auto' as const, maxHeight: 190 };

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={id} style={cardStyle}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{title}</h3>
      {children}
    </section>
  );
}

export function Dashboard({ store, settings, onOpenSettings, overlay }: Props) {
  useStore(store);
  const now = useNow(1000);
  const [view, setView] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const soon = soonTasks(store.items, now);
  const events = upcomingEvents(store.items, now);
  const todos = plainTodos(store.items);

  return (
    <div style={{ minHeight: '100vh', background: color.bg, color: color.text, fontFamily: font }}>
      {overlay && (
        <div
          role="dialog"
          aria-label="설정"
          style={{ position: 'fixed', inset: 0, zIndex: 10, background: color.bg, overflowY: 'auto' }}
        >
          {overlay}
        </div>
      )}
      <img
        src={bannerSrc(settings.bannerPath)}
        alt="배너"
        style={{ display: 'block', width: '100%', height: settings.bannerHeight, objectFit: 'cover', imageRendering: 'pixelated' }}
      />

      {store.status === 'error' && store.error && (
        <div role="alert" style={{ padding: '8px 20px', color: color.red, fontSize: 13 }}>
          {store.error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 20px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>내 일정·할일</h1>
          <Clock now={now} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 320 }}>
          <MemoInput store={store} now={() => new Date()} placeholder="적고 Enter" />
        </div>
        <button
          aria-label="설정"
          onClick={onOpenSettings}
          style={{ background: 'transparent', border: `1px solid ${color.line}`, color: color.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16 }}
        >
          ⚙
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '0 20px 20px' }}>
        <section data-testid="card-calendar" style={cardStyle}>
          <Calendar
            year={view.year}
            month={view.month}
            today={now}
            marked={markedDays(store.items, view.year, view.month)}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
          />
        </section>
        <Card id="card-soon" title="🔥 오늘 / 임박">
          <ul style={listStyle}>
            {soon.map((it) => (
              <ItemRow key={it.id} item={it} store={store} now={now} />
            ))}
          </ul>
        </Card>
        <Card id="card-events" title="🗓 일정">
          <ul style={listStyle}>
            {events.map((it) => (
              <ItemRow key={it.id} item={it} store={store} now={now} showWhen />
            ))}
          </ul>
        </Card>
        <Card id="card-todos" title={`📝 할일 (${todos.length})`}>
          <ul style={listStyle}>
            {todos.map((it) => (
              <ItemRow key={it.id} item={it} store={store} now={now} />
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
