import { useEffect, useState } from 'react';

// formatTimestamp() only recomputes when its component re-renders, so a
// relative label ("now", "5m ago") otherwise freezes until the next data
// change or manual refresh. Call this once per component that renders one,
// to force a periodic re-render independent of any data fetch.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
