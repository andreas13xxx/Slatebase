import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { BasesFilterEditor } from './BasesFilterEditor'

const columns = [{ id: 'status', label: 'Status' }] as never

describe('BasesFilterEditor accessibility', () => {
  test('has no axe violations with reorder and scope-move controls', async () => {
    const { container } = render(
      <BasesFilterEditor
        root={{ and: ['status == "a"', 'status == "b"', { or: ['status == "c"', 'status == "d"'] }] }}
        doc={{ views: [] }}
        rows={[]}
        columns={columns}
        disabled={false}
        onChange={vi.fn()}
        scopeMove={{ label: 'Zu allen Ansichten verschieben', onMove: vi.fn() }}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  }, 30000)
})
