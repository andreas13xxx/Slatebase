import { describe, expect, it, vi } from 'vitest'
import type { ILogger } from '../logger/index.js'
import { DeviationReporter, shortValue } from './deviation-reporter.js'

function makeLogger() {
  const warn = vi.fn()
  const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
  return Object.assign(logger, { warn })
}

describe('DeviationReporter', () => {
  it('logs vault, file, path and reason', () => {
    const logger = makeLogger()
    new DeviationReporter(logger).report('v1', 'app.json', [{ path: 'newLinkFormat', reason: 'unexpected enum value "foo"' }])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0]?.[0]).toBe('[obsidian-config] vault=v1 file=app.json path=newLinkFormat unexpected enum value "foo"')
  })

  it('reports the same deviation once per process, a changed value again', () => {
    const logger = makeLogger()
    const reporter = new DeviationReporter(logger)
    const first = [{ path: 'x', reason: 'unknown key (value 1)' }]
    reporter.report('v1', 'app.json', first)
    reporter.report('v1', 'app.json', first)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    reporter.report('v1', 'app.json', [{ path: 'x', reason: 'unknown key (value 2)' }])
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('treats another vault or file as a new deviation', () => {
    const logger = makeLogger()
    const reporter = new DeviationReporter(logger)
    const one = [{ path: 'x', reason: 'r' }]
    reporter.report('v1', 'app.json', one)
    reporter.report('v2', 'app.json', one)
    reporter.report('v1', 'graph.json', one)
    expect(logger.warn).toHaveBeenCalledTimes(3)
  })
})

describe('shortValue', () => {
  it('cuts long values to 80 characters', () => {
    expect(shortValue('x'.repeat(200)).length).toBeLessThanOrEqual(82)
    expect(shortValue({ a: 1 })).toBe('{"a":1}')
    expect(shortValue(undefined)).toBe('undefined')
  })
})
