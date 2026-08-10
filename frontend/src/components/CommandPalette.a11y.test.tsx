import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { CommandPalette } from './CommandPalette'
import type { Command } from '../plugins/compat/command-registry'

const mockCommands: Command[] = [
  { id: 'editor:bold', name: 'Fett', pluginId: 'core' },
  { id: 'editor:italic', name: 'Kursiv', pluginId: 'core' },
  { id: 'app:open-settings', name: 'Einstellungen öffnen', pluginId: 'core' },
]

describe('CommandPalette accessibility', () => {
  test('has no axe violations when open', async () => {
    const { container } = render(
      <CommandPalette
        commands={mockCommands}
        isOpen={true}
        onClose={() => {}}
        onExecute={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations with empty command list', async () => {
    const { container } = render(
      <CommandPalette
        commands={[]}
        isOpen={true}
        onClose={() => {}}
        onExecute={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
