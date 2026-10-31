import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { VaultAppearanceSettings } from './VaultAppearanceSettings'
import { _reset, initialize, setActiveVault } from '../../state/vaultAppearanceStore'
import { showToast } from '../ToastNotification'
import type { IApiClient } from '../../api'
import type { VaultInfo } from '../../types'

vi.mock('../ToastNotification', () => ({ showToast: vi.fn() }))

function VaultSeeder({ permission }: { permission?: VaultInfo['permission'] }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'v1', name: 'V', ...(permission ? { permission } : {}) }] })
    dispatch({ type: 'VAULT_SELECTED', payload: 'v1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function createClient(file: Record<string, unknown> = {}, refuse = false) {
  const state = { file: { ...file } }
  return {
    state,
    getAppearanceConfig: vi.fn(async () => ({ ...state.file })),
    patchAppearanceConfig: vi.fn(async (_v: string, patch: Record<string, unknown>) => {
      if (refuse) throw { message: 'Kein Schreibzugriff' }
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete state.file[key]
        else state.file[key] = value
      }
      return { ...state.file }
    }),
  }
}

async function renderSettings(client: ReturnType<typeof createClient>, permission?: VaultInfo['permission']) {
  _reset()
  initialize(client as unknown as IApiClient)
  await setActiveVault('v1')
  return render(
    <AppProvider>
      <VaultSeeder {...(permission ? { permission } : {})} />
      <VaultAppearanceSettings />
    </AppProvider>,
  )
}

describe('VaultAppearanceSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the values of the file', async () => {
    await renderSettings(createClient({ theme: 'obsidian', baseFontSize: 20, textFontFamily: 'Georgia' }))
    expect(await screen.findByLabelText('Basis-Theme')).toHaveValue('obsidian')
    expect(screen.getByLabelText('Schriftgröße')).toHaveValue(20)
    expect(screen.getByLabelText('Schrift der Texte')).toHaveValue('Georgia')
  })

  it('saves the base theme at once', async () => {
    const client = createClient()
    await renderSettings(client)
    fireEvent.change(await screen.findByLabelText('Basis-Theme'), { target: { value: 'moonstone' } })
    await waitFor(() => expect(client.patchAppearanceConfig).toHaveBeenCalledWith('v1', { theme: 'moonstone' }))
  })

  it('saves fonts and size together, and writes the default size as removal', async () => {
    const client = createClient({ baseFontSize: 20 })
    await renderSettings(client)
    fireEvent.change(await screen.findByLabelText('Schriftgröße'), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText('Schrift der Oberfläche'), { target: { value: ' Inter ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(client.patchAppearanceConfig).toHaveBeenCalled())
    expect(client.patchAppearanceConfig.mock.calls[0]?.[1]).toMatchObject({ baseFontSize: null, interfaceFontFamily: 'Inter', textFontFamily: null })
  })

  it('refuses a font list with characters that could leave a CSS declaration', async () => {
    const client = createClient()
    await renderSettings(client)
    fireEvent.change(await screen.findByLabelText('Schrift der Texte'), { target: { value: 'x; color: red' } })
    expect(screen.getByLabelText('Schrift der Texte')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('refuses a font size outside 10 to 30', async () => {
    await renderSettings(createClient())
    fireEvent.change(await screen.findByLabelText('Schriftgröße'), { target: { value: '99' } })
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('locks the controls without write access', async () => {
    await renderSettings(createClient(), 'read')
    expect(await screen.findByLabelText('Basis-Theme')).toBeDisabled()
    expect(screen.getByLabelText('Schriftgröße')).toBeDisabled()
  })

  it('says why a refused save failed', async () => {
    await renderSettings(createClient({}, true))
    fireEvent.change(await screen.findByLabelText('Basis-Theme'), { target: { value: 'obsidian' } })
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('Kein Schreibzugriff')))
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderSettings(createClient({ accentColor: '#ff0000' }))
    await screen.findByLabelText('Basis-Theme')
    expect(await axe(container)).toHaveNoViolations()
  }, 30000)
})
