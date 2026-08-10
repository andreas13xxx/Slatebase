import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'

const mockItems: ContextMenuItem[] = [
  { id: 'open', label: 'Öffnen' },
  { id: 'rename', label: 'Umbenennen' },
  { id: 'sep-1', label: '', separator: true },
  { id: 'delete', label: 'Löschen' },
]

describe('ContextMenu accessibility', () => {
  test('has no axe violations', async () => {
    const { container } = render(
      <ContextMenu
        x={100}
        y={100}
        items={mockItems}
        onClose={() => {}}
        onSelect={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations with disabled items', async () => {
    const itemsWithDisabled: ContextMenuItem[] = [
      { id: 'open', label: 'Öffnen' },
      { id: 'paste', label: 'Einfügen', disabled: true },
      { id: 'delete', label: 'Löschen' },
    ]
    const { container } = render(
      <ContextMenu
        x={200}
        y={200}
        items={itemsWithDisabled}
        onClose={() => {}}
        onSelect={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
