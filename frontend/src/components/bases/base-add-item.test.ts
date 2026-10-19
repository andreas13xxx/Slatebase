import { describe, it, expect } from 'vitest'
import { deriveBaseScopeFolder, buildBlankFrontmatter } from './base-add-item'
import type { BaseDocument, BaseView } from '@slatebase/shared-contracts'

describe('deriveBaseScopeFolder', () => {
  it('uses the folder from a file.inFolder document filter', () => {
    const doc: BaseDocument = { filters: 'file.inFolder("Tasks")', views: [] }
    expect(deriveBaseScopeFolder(doc, undefined)).toBe('Tasks')
  })

  it('prefers a view filter folder over the document filter', () => {
    const doc: BaseDocument = { filters: 'file.inFolder("Docs")', views: [] }
    const view: BaseView = { type: 'table', filters: 'file.inFolder("Tasks/Open")' }
    expect(deriveBaseScopeFolder(doc, view)).toBe('Tasks/Open')
  })

  it('finds the folder inside an and/or group', () => {
    const doc: BaseDocument = { filters: { and: ['status == "open"', 'file.inFolder("Projects")'] }, views: [] }
    expect(deriveBaseScopeFolder(doc, undefined)).toBe('Projects')
  })

  it('falls back to the vault root when there is no folder filter', () => {
    const doc: BaseDocument = { filters: 'status == "open"', views: [] }
    expect(deriveBaseScopeFolder(doc, undefined)).toBe('')
  })
})

describe('buildBlankFrontmatter', () => {
  it('returns empty for no property columns', () => {
    expect(buildBlankFrontmatter([], { views: [] }, undefined)).toBe('')
  })

  it('writes a blank key per column', () => {
    const fm = buildBlankFrontmatter(['status', 'priority'], { views: [] }, undefined)
    expect(fm).toBe('---\nstatus:\npriority:\n---\n')
  })

  it('pre-fills a key from a prop == "value" equality filter', () => {
    const doc: BaseDocument = { filters: 'status == "open"', views: [] }
    const fm = buildBlankFrontmatter(['status', 'priority'], doc, undefined)
    expect(fm).toBe('---\nstatus: open\npriority:\n---\n')
  })

  it('view equality filter also pre-fills', () => {
    const doc: BaseDocument = { views: [] }
    const view: BaseView = { type: 'table', filters: 'type == "task"' }
    expect(buildBlankFrontmatter(['type'], doc, view)).toBe('---\ntype: task\n---\n')
  })
})
