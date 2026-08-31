import { useEffect, useRef, useState } from 'react';

/**
 * Counts up from the previous value to `value` on change, using rAF and an
 * ease-out cubic. Skips straight to the final value under
 * prefers-reduced-motion — this is decoration, never the only way the
 * number appears.
 */
export function useCountUp(value: number, durationMs = 900): number {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduceMotion) {
      prevValue.current = value;
      return;
    }

    const start = prevValue.current;
    const delta = value - start;
    const startTime = performance.now();
    let frame: number;

    function tick(now: number): void {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(start + delta * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        prevValue.current = value;
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  return reduceMotion ? value : display;
}
