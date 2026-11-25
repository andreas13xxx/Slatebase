import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseDocument } from '@slatebase/shared-contracts'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { registerBasesView, resetForVault } from '../../plugins/compat/bases-view-registry'
import { BasesViewOptionsDialog } from './BasesViewOptionsDialog'
import { getViewOption, setViewOption } from './base-edit'

const doc: BaseDocument = {
  properties: {},
  views: [{ type: 'taskList', name: 'Today', _unknown: { showCount: true } }],
}

describe('setViewOption', () => {
  it('writes plugin option keys into the passthrough bucket and removes them again', () => {
    const next = setViewOption(doc, 0, 'enableSearch', true)
    expect(getViewOption(next.views[0]!, 'enableSearch')).toBe(true)
    expect(getViewOption(next.views[0]!, 'showCount')).toBe(true)
    const cleared = setViewOption(next, 0, 'enableSearch', undefined)
    expect(getViewOption(cleared.views[0]!, 'enableSearch')).toBeUndefined()
  })

  it('writes keys with a typed slot into that slot', () => {
    const next = setViewOption(doc, 0, 'limit', 25)
    expect(next.views[0]!.limit).toBe(25)
  })
})

describe('BasesViewOptionsDialog', () => {
  beforeEach(() => {
    installObsidianGlobals()
    resetForVault()
  })

  const props = (onChange: ReturnType<typeof vi.fn>) => ({
    doc,
    index: 0,
    columns: [{ id: 'note.status', label: 'status' }],
    typeOptions: [{ id: 'taskList', label: 'Task list' }],
    disabled: false,
    onChange,
    onClose: () => {},
  }) as unknown as Parameters<typeof BasesViewOptionsDialog>[0]

  it('renders the options a plugin declared and stores a change in the view', () => {
    registerBasesView('taskList', {
      name: 'Task list',
      factory: (_c, el) => ({ containerEl: el, load() {}, onDataUpdated() {} }),
      options: () => [
        { key: 'showCount', type: 'toggle', displayName: 'Show count', default: false },
        { type: 'group', displayName: 'Search', items: [{ key: 'enableSearch', type: 'toggle', displayName: 'Enable search' }] },
      ],
    }, 'tasks-plugin')
    const onChange = vi.fn()
    render(<BasesViewOptionsDialog {...props(onChange)} />)
    const showCount = screen.getByLabelText('Show count') as HTMLInputElement
    expect(showCount.checked).toBe(true)
    fireEvent.click(screen.getByLabelText('Enable search'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const update = onChange.mock.calls[0]![0] as (d: BaseDocument) => BaseDocument
    expect(getViewOption(update(doc).views[0]!, 'enableSearch')).toBe(true)
  })

  it('commits a rename while typing, so closing with Escape cannot lose it', () => {
    const onChange = vi.fn()
    render(<BasesViewOptionsDialog {...props(onChange)} />)
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Heute' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    const update = onChange.mock.calls[0]![0] as (d: BaseDocument) => BaseDocument
    expect(update(doc).views[0]!.name).toBe('Heute')
  })

  it('says so when the view type has no settings of its own', () => {
    render(<BasesViewOptionsDialog {...props(vi.fn())} />)
    expect(screen.getByText(/keine weiteren Einstellungen/)).toBeTruthy()
  })
})

