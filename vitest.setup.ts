// Vitest setup: polyfills and global mocks
import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    let store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = String(value); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      length: 0,
      key: (index: number) => Object.keys(store)[index] || null,
    };
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
  }
}

