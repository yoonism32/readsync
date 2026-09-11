import { useSyncExternalStore } from 'react';

export type Effects = 'full' | 'quiet';
const key = 'readsync-effects';
let memory: Effects | undefined;
export function readEffects(): Effects {
  if (memory) return memory;
  try { return localStorage.getItem(key) === 'quiet' ? 'quiet' : 'full'; }
  catch { return 'full'; }
}
export function setEffects(value: Effects) {
  memory = value;
  try { localStorage.setItem(key, value); } catch { /* Still works for this visit. */ }
  document.documentElement.dataset.effects = value;
  window.dispatchEvent(new Event('readsync-effects'));
}
function subscribe(callback: () => void) {
  const changed = () => { memory = undefined; callback(); };
  window.addEventListener('readsync-effects', callback);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener('readsync-effects', callback);
    window.removeEventListener('storage', changed);
  };
}
export function useEffects() {
  return useSyncExternalStore(subscribe, readEffects, () => 'full' as const);
}
