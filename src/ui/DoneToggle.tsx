const GREEN = '#4ade80';

/** 할일 완료 토글. 안 한 일은 빈 보고서, 한 일은 초록 체크가 든 보고서 모양이다. */
export function DoneToggle({ done, label, onToggle }: { done: boolean; label: string; onToggle(): void }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={done ? '눌러서 완료 취소' : '완료로 표시'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', flexShrink: 0, color: done ? GREEN : '#9b9b9b' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
        <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
        {done && <path d="M9 14l2 2l4 -4" />}
      </svg>
    </button>
  );
}

/** 오른쪽에 붙는 "완료" 딱지 */
export function DoneBadge() {
  return (
    <span style={{ fontSize: 11, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 4, padding: '0 5px', flexShrink: 0 }}>완료</span>
  );
}
