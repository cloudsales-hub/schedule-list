import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest에서는 globals를 켜지 않아 자동 정리가 되지 않으므로 직접 등록한다.
afterEach(() => cleanup());
