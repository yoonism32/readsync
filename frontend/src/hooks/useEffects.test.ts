import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEffects, setEffects } from './useEffects.js';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); window.dispatchEvent(new Event('storage')); });
describe('interface effects preference', () => {
  it('defaults to full effects', () => { expect(readEffects()).toBe('full'); });
  it('saves quiet mode and updates the document', () => {
    setEffects('quiet');
    expect(localStorage.getItem('readsync-effects')).toBe('quiet');
    expect(readEffects()).toBe('quiet');
    expect(document.documentElement.dataset.effects).toBe('quiet');
    setEffects('full');
    expect(readEffects()).toBe('full');
  });
  it('works when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(() => setEffects('quiet')).not.toThrow();
    expect(readEffects()).toBe('quiet');
    setEffects('full');
  });
});
