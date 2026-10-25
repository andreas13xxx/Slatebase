import { describe, it, expect } from 'vitest'
import { buildQuerySpec, buildHostQuerySpec, filterRows, evaluateFormulaColumn } from './base-eval.js'
import type { BaseDocument, BaseQueryRowWire, BaseRow } from './types.js'

const wire = (path: string, values: Record<string, string[]>, extra: Partial<BaseQueryRowWire> = {}): BaseQueryRowWire => ({
  path,
  fileName: path.replace(/^.*\//, '').replace(/\.md$/, ''),
  values,
  ...extra,
})

describe('buildQuerySpec', () => {
  it('never pushes the view limit to the backend', () => {
    const spec = buildQuerySpec({ views: [] }, { type: 'table', order: ['status'], limit: 5 })
    expect(spec.limit).toBeUndefined()
  })
})

describe('buildQuerySpec filter references', () => {
  it('requests the receiver property of a method-call filter, not "prop.method"', () => {
    const doc: BaseDocument = { filters: { and: ['title.contains("x")', 'price.toFixed(2) > 1', 'file.hasTag("t")'] }, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: [] })
    expect(spec.columns.sort()).toEqual(['price', 'title'])
  })

  it('requests properties read by formulas, but not formula.* references', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2', plus: 'formula.double + 1' }, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: ['formula.plus'] })
    expect(spec.columns).toEqual(['price'])
  })

  it('ignores identifiers inside quoted strings but keeps real references', () => {
    const doc: BaseDocument = { filters: `status == "other_prop" && 'x y' != prio`, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: [] })
    expect(spec.columns.sort()).toEqual(['prio', 'status'])
  })

  it('stays fast on a long unterminated string with many escaped quotes', () => {
    const doc: BaseDocument = { filters: '"' + '\\"'.repeat(50_000), views: [] }
    const t0 = Date.now()
    buildQuerySpec(doc, { type: 'table', order: [] })
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('filterRows', () => {
  const doc: BaseDocument = { filters: 'status == "open"', views: [] }

  it('filters first, then applies the view limit and reports the pre-limit total', () => {
    const rows = [
      wire('a.md', { status: ['done'] }),
      wire('b.md', { status: ['open'] }),
      wire('c.md', { status: ['open'] }),
    ]
    const out = filterRows(rows, doc, { type: 'table', limit: 1 })
    expect(out.rows.map((r) => r.path)).toEqual(['b.md'])
    expect(out.total).toBe(2)
  })

  it('matches a method-call filter on the fetched property value end to end', () => {
    const rows = [wire('a.md', { title: ['Plan A'] }), wire('b.md', { title: ['Notes'] })]
    const d: BaseDocument = { filters: 'title.contains("Plan")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('file.inFolder("") matches nothing', () => {
    const rows = [wire('root.md', {}, { folder: '' }), wire('Tasks/a.md', {}, { folder: 'Tasks' })]
    const d: BaseDocument = { filters: 'file.inFolder("")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows).toEqual([])
  })

  it('folds file metadata into file.* values and honours file.hasTag / file.inFolder', () => {
    const rows = [
      wire('Tasks/a.md', {}, { folder: 'Tasks', tags: ['urgent'], ext: 'md' }),
      wire('b.md', {}, { folder: '', tags: [], ext: 'md' }),
    ]
    const d: BaseDocument = { filters: { and: ['file.hasTag("urgent")', 'file.inFolder("Tasks")'] }, views: [] }
    const out = filterRows(rows, d, { type: 'table' })
    expect(out.rows.map((r) => r.path)).toEqual(['Tasks/a.md'])
    expect(out.rows[0]?.values['file.ext']).toBe('md')
  })
})

describe('filters over formulas, lists and file fields', () => {
  it('filters on a formula value', () => {
    const rows = [wire('a.md', { due: ['2000-01-01'] }), wire('b.md', { due: ['2999-01-01'] })]
    const d: BaseDocument = { formulas: { overdue: 'date(due) < today()' }, filters: 'formula.overdue', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('keeps tags/aliases and file.tags/links lists even with a single entry', () => {
    const rows = [
      wire('one.md', { tags: ['urgent'] }, { tags: ['urgent'] }),
      wire('two.md', { tags: ['urgent', 'home'] }, { tags: ['urgent', 'home'] }),
    ]
    // exact element match, identical behaviour for one and two entries
    const d: BaseDocument = { filters: 'tags.contains("urg")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows).toEqual([])
    const lengths = filterRows(rows, { filters: 'file.tags.length >= 1', views: [] }, { type: 'table' })
    expect(lengths.rows.map((r) => r.path)).toEqual(['one.md', 'two.md'])
    const one = filterRows(rows, { filters: 'tags.length == 1', views: [] }, { type: 'table' })
    expect(one.rows.map((r) => r.path)).toEqual(['one.md'])
  })

  it('exposes file.path and file.basename', () => {
    const rows = [wire('Projects/a.md', {}), wire('Other/b.md', {})]
    const d: BaseDocument = { filters: 'file.path.startsWith("Projects/") && file.basename == "a"', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['Projects/a.md'])
  })

  it('collects refs from note["..."] indexing', () => {
    const d: BaseDocument = { filters: 'note["due-date"] != ""', views: [] }
    expect(buildQuerySpec(d, { type: 'table', order: [] }).columns).toEqual(['due-date'])
  })
})

describe('file.size and file.backlinks (R4)', () => {
  it('resolves file.size as a number in a filter', () => {
    const rows = [wire('a.md', {}, { size: 5000 }), wire('b.md', {}, { size: 100 })]
    const d: BaseDocument = { filters: 'file.size > 1000', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('resolves file.size in a formula', () => {
    const rows = [wire('a.md', {}, { size: 2048 })]
    const d: BaseDocument = { formulas: { kb: 'file.size / 1024' }, filters: 'formula.kb == 2', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('resolves file.backlinks as a list (length + contains)', () => {
    const rows = [
      wire('a.md', {}, { backlinks: ['x.md', 'y.md'] }),
      wire('b.md', {}, { backlinks: ['x.md'] }),
      wire('c.md', {}, {}),
    ]
    expect(
      filterRows(rows, { filters: 'file.backlinks.length >= 2', views: [] }, { type: 'table' }).rows.map((r) => r.path),
    ).toEqual(['a.md'])
    expect(
      filterRows(rows, { filters: 'file.backlinks.contains("x.md")', views: [] }, { type: 'table' }).rows.map((r) => r.path),
    ).toEqual(['a.md', 'b.md'])
  })

  it('keeps file.backlinks a list even with a single entry', () => {
    const rows = [wire('b.md', {}, { backlinks: ['x.md'] })]
    expect(
      filterRows(rows, { filters: 'file.backlinks.length == 1', views: [] }, { type: 'table' }).rows.map((r) => r.path),
    ).toEqual(['b.md'])
  })

  it('declares referenced file.* columns in the query spec', () => {
    const d: BaseDocument = { filters: 'file.size > 0', views: [] }
    const spec = buildQuerySpec(d, { type: 'table', order: ['file.size'] })
    expect(spec.fileColumns).toContain('file.size')
  })
})

describe('this — the host note (embedded base)', () => {
  const host: BaseRow = {
    path: 'Projekte/Plan.md',
    fileName: 'Plan',
    values: { status: ['open'], 'file.folder': 'Projekte', 'file.tags': ['proj'], 'file.size': 120 },
  }
  /** `thisRow` null means "no host" (an explicit undefined would select the default host). */
  const keep = (filters: string, rows: BaseQueryRowWire[], thisRow: BaseRow | null = host) =>
    filterRows(rows, { filters, views: [] }, { type: 'table' }, false, undefined, thisRow ?? undefined).rows.map((r) => r.path)

  it('resolves this.file.* against the host', () => {
    const rows = [wire('a.md', {}), wire('b.md', {})]

    expect(keep('this.file.name == "Plan"', rows)).toEqual(['a.md', 'b.md'])
    expect(keep('this.file.path == "Projekte/Plan.md"', rows)).toEqual(['a.md', 'b.md'])
    expect(keep('this.file.folder == "Projekte"', rows)).toEqual(['a.md', 'b.md'])
    expect(keep('this.file.size == 120', rows)).toEqual(['a.md', 'b.md'])
    expect(keep('this.file.tags.contains("proj")', rows)).toEqual(['a.md', 'b.md'])
    expect(keep('this.file.name == "Anderes"', rows)).toEqual([])
  })

  it('resolves this.<property> and this.note.<property> from the host frontmatter', () => {
    const rows = [wire('a.md', { status: ['open'] }), wire('b.md', { status: ['done'] })]

    expect(keep('status == this.status', rows)).toEqual(['a.md'])
    expect(keep('status == this.note.status', rows)).toEqual(['a.md'])
  })

  it('filters rows that link to the host with file.hasLink(this.file)', () => {
    const rows = [
      wire('a.md', {}, { links: ['Plan'] }),
      wire('b.md', {}, { links: ['Projekte/Plan'] }),
      wire('c.md', {}, { links: ['Plan.md'] }),
      wire('d.md', {}, { links: ['Anderes'] }),
      wire('e.md', {}),
    ]

    expect(keep('file.hasLink(this.file)', rows)).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('resolves everything to null without a host, excluding the row instead of keeping it', () => {
    const rows = [wire('a.md', { status: ['open'] }, { links: ['Plan'] })]

    expect(keep('file.hasLink(this.file)', rows, null)).toEqual([])
    expect(keep('status == this.status', rows, null)).toEqual([])
    expect(keep('this.file.name == "Plan"', rows, null)).toEqual([])
  })

  it('is available inside formula columns', () => {
    const d: BaseDocument = { formulas: { same: 'status == this.status' }, views: [] }
    const row: BaseRow = { path: 'a.md', fileName: 'a', values: { status: ['open'] } }

    expect(evaluateFormulaColumn(d, row, 'same', host)).toEqual({ ok: true, value: true })
    expect(evaluateFormulaColumn(d, row, 'same')).toEqual({ ok: true, value: false })
  })

  it('matches a link only by its full name or as a path suffix, not by a partial name', () => {
    const rows = [wire('a.md', {}, { links: ['Masterplan'] }), wire('b.md', {}, { links: ['Plan-B'] })]

    expect(keep('file.hasLink(this.file)', rows)).toEqual([])
  })
})

describe('this — query specs', () => {
  const doc: BaseDocument = {
    filters: { and: ['file.hasLink(this.file)', 'status == this.status', 'this.file.size > 10', 'tags.contains(this.note.topic)'] },
    formulas: { same: 'owner == this.owner' },
    views: [],
  }

  it('keeps this.* out of the candidate query columns', () => {
    const spec = buildQuerySpec(doc, { type: 'table' })

    expect(spec.columns.some((c) => c === 'this' || c.startsWith('this.'))).toBe(false)
    expect(spec.columns).toEqual(expect.arrayContaining(['status', 'tags', 'owner']))
  })

  it('builds no host query when the base never reads this', () => {
    expect(buildHostQuerySpec({ filters: 'status == "x"', views: [] }, { type: 'table' }, 'Host.md')).toBeNull()
  })

  it('asks the host query for exactly the referenced host columns, narrowed to the host path', () => {
    const spec = buildHostQuerySpec(doc, { type: 'table' }, 'Projekte/Plan.md')!

    expect(spec.filters).toEqual({ path: 'Projekte/Plan.md' })
    expect([...spec.columns].sort()).toEqual(['owner', 'status', 'topic'])
    expect(spec.fileColumns).toEqual(['file.size'])
  })

  it('also looks at view filters', () => {
    const spec = buildHostQuerySpec({ views: [] }, { type: 'table', filters: 'status == this.status' }, 'H.md')!

    expect(spec.columns).toEqual(['status'])
  })
})

describe('evaluateFormulaColumn', () => {
  const row: BaseRow = { path: 'a.md', fileName: 'a', values: { price: 4 } }

  it('evaluates a formula over row values', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2' }, views: [] }
    expect(evaluateFormulaColumn(doc, row, 'double')).toEqual({ ok: true, value: 8 })
  })

  it('resolves formula.x references to other formulas', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2', plus: 'formula.double + 1' }, views: [] }
    expect(evaluateFormulaColumn(doc, row, 'plus')).toEqual({ ok: true, value: 9 })
  })

  it('reports a cycle as an error instead of recursing', () => {
    const doc: BaseDocument = { formulas: { a: 'formula.b', b: 'formula.a' }, views: [] }
    const r = evaluateFormulaColumn(doc, row, 'a')
    expect(r.ok).toBe(false)
  })

  it('reports an unknown formula id', () => {
    expect(evaluateFormulaColumn({ views: [] }, row, 'nope').ok).toBe(false)
  })
})

describe('property-type list keys (R2)', () => {
  // A property declared/observed as a list stays a list even with one value,
  // instead of being unwrapped to a scalar by the one-element heuristic.
  it('keeps a one-element value a list when the key is in listKeys', () => {
    const rows = [wire('a.md', { authors: ['Ada'] })]
    const d: BaseDocument = { filters: 'authors.length == 1', views: [] }
    // Without listKeys the single value is a scalar: .length would be the
    // string length (3), so the filter fails.
    expect(filterRows(rows, d, { type: 'table' }).rows).toEqual([])
    // With listKeys it is a one-element list: .length == 1 matches.
    expect(filterRows(rows, d, { type: 'table' }, false, ['authors']).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('honours listKeys in a formula too, not only filters', () => {
    const rows = [wire('a.md', { authors: ['Ada'] })]
    const d: BaseDocument = { formulas: { n: 'authors.length' }, filters: 'formula.n == 1', views: [] }
    expect(filterRows(rows, d, { type: 'table' }, false, ['authors']).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('leaves a scalar a scalar even when another key is a list key', () => {
    const rows = [wire('a.md', { title: ['Hello'], authors: ['Ada', 'Bob'] })]
    // title is NOT in listKeys → stays scalar; contains works as substring.
    const d: BaseDocument = { filters: 'title.contains("ell")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }, false, ['authors']).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('is unchanged for an untyped vault (no listKeys) — regression', () => {
    const rows = [wire('a.md', { status: ['open'] })]
    // One-element value reads as a scalar exactly as before.
    const d: BaseDocument = { filters: 'status == "open"', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
    expect(filterRows(rows, d, { type: 'table' }, false, []).rows.map((r) => r.path)).toEqual(['a.md'])
  })
})
