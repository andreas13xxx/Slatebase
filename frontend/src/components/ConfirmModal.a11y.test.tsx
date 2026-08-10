import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ConfirmModal } from './ConfirmModal'

describe('ConfirmModal accessibility', () => {
  test('has no axe violations when open', async () => {
    const { container } = render(
      <ConfirmModal
        open={true}
        title="Bestätigung"
        message="Möchten Sie diesen Vorgang durchführen?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations with danger variant', async () => {
    const { container } = render(
      <ConfirmModal
        open={true}
        title="Löschen bestätigen"
        message="Diese Aktion kann nicht rückgängig gemacht werden."
        variant="danger"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
