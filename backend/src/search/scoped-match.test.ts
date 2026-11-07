import { describe, it, expect } from 'vitest'
import { parseSearchQuery } from './query-parser.js'
import { matchTextOperators } from './scoped-match.js'

const doc = [
  '# Baking',
  'mix flour and eggs',
  '',
  'flour is heavy',
  '- [ ] buy Flour',
  '- [x] buy eggs',
  '# Other',
  'eggs only',
].join('\n')

const run = (q: string, caseSensitive = false) =>
  matchTextOperators(doc, parseSearchQuery(q).operators, caseSensitive)
const lines = (q: string) => run(q)?.map((h) => h.lineIndex)

describe('parseSearchQuery — text operators', () => {
  it('parses terms in parentheses and quotes', () => {
    const [op] = parseSearchQuery('line:(mix "heavy duty" flour)').operators
    expect(op?.type).toBe('line')
    expect(op?.terms).toEqual(['mix', 'heavy duty', 'flour'])
  })
  it('does not treat words that merely end in an operator name as operators', () => {
    expect(parseSearchQuery('inline:x profile:y').operators).toEqual([])
  })
  it('parses [key:value] as a property filter but leaves links alone', () => {
    const q = parseSearchQuery('[status:open] -[kind:note] [[Wiki]] [text](url) [a:b](c)')
    expect(q.operators.map((o) => [o.type, o.negated, o.propertyKey, o.propertyValue])).toEqual([
      ['property', false, 'status', 'open'],
      ['property', true, 'kind', 'note'],
    ])
    expect(q.freeText).toBe('[[Wiki]] [text](url) [a:b](c)')
  })
  it('distinguishes task, task-todo and task-done', () => {
    expect(parseSearchQuery('task-todo:x task-done:y task:z').operators.map((o) => o.type))
      .toEqual(['task-todo', 'task-done', 'task'])
  })
})

describe('matchTextOperators', () => {
  it('line: needs all terms on one line', () => {
    expect(lines('line:(flour eggs)')).toEqual([1])
    expect(run('line:(mix heavy)')).toBeNull()
  })
  it('block: needs all terms in one paragraph', () => {
    expect(run('block:(flour eggs)')).not.toBeNull()
    expect(run('block:(mix heavy)')).toBeNull()
  })
  it('section: needs all terms below one heading', () => {
    expect(run('section:(mix heavy)')).not.toBeNull()
    expect(run('section:(mix "eggs only")')).toBeNull()
  })
  it('task operators only look at task lines', () => {
    expect(lines('task:buy')).toEqual([4, 5])
    expect(lines('task-todo:buy')).toEqual([4])
    expect(lines('task-done:buy')).toEqual([5])
    expect(run('task:mix')).toBeNull()
  })
  it('match-case and ignore-case override the default', () => {
    expect(run('match-case:flour')?.map((h) => h.lineIndex)).toEqual([1, 3])
    expect(run('ignore-case:FLOUR', true)).not.toBeNull()
    expect(run('content:FLOUR', true)).toBeNull()
  })
  it('a negated operator excludes the file when it matches', () => {
    expect(run('-content:flour')).toBeNull()
    expect(run('-content:absent line:mix')).not.toBeNull()
  })
})
