import { vi } from 'vitest'

type Handler = (init: RequestInit | undefined, url: string) => { status?: number; body?: unknown }

/** Stubs `fetch` with a router keyed by `METHOD path` (query string ignored). Unmatched calls fail the test. */
export function routeFetch(routes: Record<string, Handler>) {
  const calls: Array<{ key: string; init: RequestInit | undefined }> = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = url.split('?')[0] ?? url
    const key = `${init?.method ?? 'GET'} ${path}`
    calls.push({ key, init })
    const handler = routes[key]
    if (handler === undefined) throw new Error(`Unexpected fetch: ${key}`)
    const { status = 200, body } = handler(init, url)
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status })
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

export function bodyOf(init: RequestInit | undefined): unknown {
  return init?.body === undefined ? undefined : JSON.parse(init.body as string)
}
