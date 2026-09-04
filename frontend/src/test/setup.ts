// jsdom in this setup does not expose localStorage, and the api client reads
// the stored API key at module level in helpers like coverUrl(). Without a
// shim any component that renders a cover image throws on first paint.
class MemoryStorage implements Storage {
  #store = new Map<string, string>();

  get length(): number {
    return this.#store.size;
  }

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
}

// jsdom does not implement ResizeObserver, and Layout uses one to decide
// whether its nav needs the scroll edge-fade. Any test that renders Layout
// (directly, or via a page that mounts it) threw on first paint without this
// — including Login.test.tsx, which was failing on main for that reason.
// A no-op observer is enough: nothing under test asserts on resize behaviour,
// and the callback would never fire in jsdom anyway since nothing lays out.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class NoopResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: NoopResizeObserver,
    configurable: true,
  });
}
