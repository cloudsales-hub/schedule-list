import { color } from './styles';

interface Props {
  year: number;
  /** 1~12 */
  month: number;
  today: Date;
  /** 일정이나 마감이 있는 날(일) */
  marked: Set<number>;
  onPrev(): void;
  onNext(): void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function Calendar({ year, month, today, marked, onPrev, onNext }: Props) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const navButton = { background: 'transparent', color: color.text, border: 'none', cursor: 'pointer', fontSize: 14 };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button aria-label="이전 달" onClick={onPrev} style={navButton}>
          ◀
        </button>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          {year}년 {month}월
        </h3>
        <button aria-label="다음 달" onClick={onNext} style={navButton}>
          ▶
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 12 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ color: color.sub, padding: '2px 0' }}>
            {w}
          </div>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <div key={`b${i}`} />
          ) : (
            <div key={day} data-testid={`day-${day}`} data-today={String(isThisMonth && today.getDate() === day)} style={{ padding: '3px 0' }}>
              <span
                style={{
                  display: 'inline-block',
                  minWidth: 22,
                  lineHeight: '22px',
                  borderRadius: 11,
                  background: isThisMonth && today.getDate() === day ? color.blue : 'transparent',
                }}
              >
                {day}
              </span>
              <div style={{ height: 6 }}>
                {marked.has(day) && (
                  <span
                    data-testid={`dot-${day}`}
                    style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 3, background: '#f59e0b' }}
                  />
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
