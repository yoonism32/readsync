import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useCountUp } from './useCountUp.js';

describe('useCountUp', () => {
  it('returns the target value immediately when reduced motion is enabled', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      }),
    });

    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });
});
