// Web Storage polyfill. The jsdom build paired with this Vitest version exposes
// `localStorage` as a bare, method-less object, which breaks every component
// that persists theme/settings/session. Install a Map-backed Storage on both
// the global scope and the jsdom window so reads and writes line up.

class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const storage = new MemoryStorage();

function install(target: unknown): void {
  if (!target) {
    return;
  }
  try {
    Object.defineProperty(target, "localStorage", { value: storage, configurable: true, writable: true });
  } catch {
    (target as { localStorage?: unknown }).localStorage = storage;
  }
}

install(globalThis);
if (typeof window !== "undefined" && (window as unknown) !== (globalThis as unknown)) {
  install(window);
}
