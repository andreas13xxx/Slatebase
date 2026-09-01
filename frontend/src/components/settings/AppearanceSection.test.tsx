import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProvider } from '../../state'
import { AuthProvider } from '../../state/authContext'
import { AppearanceSection } from './AppearanceSection'
import { _reset as resetUiSettings, getUiSettings } from '../../state/userSettingsStore'

vi.mock('../ToastNotification', () => ({ showToast: vi.fn() }))

function renderSection() {
  return render(
    <AuthProvider>
      <AppProvider>
        <AppearanceSection />
      </AppProvider>
    </AuthProvider>
  )
}

describe('AppearanceSection', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    resetUiSettings()
  })

  describe('status bar', () => {
    it('shows the global status bar toggle', () => {
      renderSection()
      expect(screen.getByLabelText('Statusleiste anzeigen')).toBeChecked()
    })

    it('shows one toggle per built-in status bar item when the status bar is visible', () => {
      renderSection()

      expect(screen.getByLabelText('Uhr')).toBeInTheDocument()
      expect(screen.getByLabelText('Vault-Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Wort- und Zeichenanzahl')).toBeInTheDocument()
      expect(screen.getByLabelText('Cursor-Position')).toBeInTheDocument()
    })

    it('hides the per-item toggles when the global status bar toggle is off', () => {
      renderSection()

      fireEvent.click(screen.getByLabelText('Statusleiste anzeigen'))

      expect(screen.queryByLabelText('Wort- und Zeichenanzahl')).not.toBeInTheDocument()
    })

    it('toggling an item leaves the others alone', () => {
      renderSection()

      fireEvent.click(screen.getByLabelText('Wort- und Zeichenanzahl'))

      expect(screen.getByLabelText('Wort- und Zeichenanzahl')).not.toBeChecked()
      expect(screen.getByLabelText('Cursor-Position')).toBeChecked()
      expect(getUiSettings().statusBarItems['wordStats']).toBe(false)
    })
  })

  describe('toolbar', () => {
    it('shows the toolbar visibility toggle and docking side', () => {
      renderSection()

      expect(screen.getByLabelText('Werkzeugleiste anzeigen')).toBeChecked()
      expect(screen.getByLabelText('Position')).toHaveValue('left')
    })

    it('moves the toolbar to the right', () => {
      renderSection()

      fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'right' } })

      expect(getUiSettings().toolbar.position).toBe('right')
    })

    it('disables the reset button while the toolbar is untouched', () => {
      renderSection()
      expect(screen.getByRole('button', { name: 'Zurücksetzen' })).toBeDisabled()
    })
  })

  describe('file explorer', () => {
    it('toggles follow-active-file, which used to live under Vault', () => {
      renderSection()

      const toggle = screen.getByLabelText('Aktive Datei im Explorer verfolgen')
      expect(toggle).not.toBeChecked()

      fireEvent.click(toggle)

      expect(getUiSettings().explorerFollowActiveFile).toBe(true)
    })
  })

  describe('display settings moved from Profil', () => {
    it('offers the colour scheme here', () => {
      renderSection()
      expect(screen.getByLabelText('Farbschema')).toBeInTheDocument()
    })

    it('offers the language here', () => {
      renderSection()
      expect(screen.getByLabelText('Sprache')).toBeInTheDocument()
    })
  })
})
