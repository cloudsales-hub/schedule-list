import { color } from './styles';

const pad = (n: number) => String(n).padStart(2, '0');

/** 큼직한 HH:MM:SS 시계. */
export function Clock({ now }: { now: Date }) {
  const parts = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="현재 시각">
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span style={{ color: color.sub, fontSize: 28 }}>:</span>}
          <span
            style={{
              background: color.card,
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 32,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}
