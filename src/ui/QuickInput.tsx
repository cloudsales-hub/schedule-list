import type { ItemsStore } from '../core/store';
import { MemoInput } from './MemoInput';
import { color, font } from './styles';

interface Props {
  store: ItemsStore;
  now: () => Date;
  onClose(): void;
}

/** 단축키로 뜨는 작은 입력창. 입력 해석과 저장은 MemoInput이 맡고, 여기서는 창 모양만 만든다. */
export function QuickInput({ store, now, onClose }: Props) {
  return (
    <div
      data-testid="quick-root"
      style={{
        boxSizing: 'border-box',
        height: '100vh',
        padding: 16,
        background: color.card,
        color: color.text,
        fontFamily: font,
        border: '2px solid #d0d0d0', // 어떤 배경 위에서도 창이 보이도록 밝은 회색 테두리
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 12, color: color.sub, marginBottom: 8 }}>빠른 메모 · Enter 저장 · Esc 취소</div>
      <MemoInput store={store} now={now} onDone={onClose} autoFocus placeholder="들은 내용을 바로 적으세요" />
    </div>
  );
}
