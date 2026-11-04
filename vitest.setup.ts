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

// No test may reach Datadog. Tests mock the SDK; this catches any that don't.
const DATADOG_HOST = /datadoghq\.|browser-intake-|ddog-gov\./
const realFetch = globalThis.fetch
if (realFetch) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (DATADOG_HOST.test(url)) throw new Error(`Test tried to contact Datadog: ${url.split('?')[0]}`)
    return realFetch(input, init)
  }) as typeof fetch
}
