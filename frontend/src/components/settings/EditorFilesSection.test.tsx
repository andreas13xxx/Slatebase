import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { EditorFilesSection } from './EditorFilesSection'
import { buildAttachmentPath, parseAttachmentPath } from './attachmentPath'
import { _reset, initialize, setActiveVault } from '../../state/vaultAppConfigStore'
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
    getAppConfig: vi.fn(async () => ({ ...state.file })),
    patchAppConfig: vi.fn(async (_v: string, patch: Record<string, unknown>) => {
      if (refuse) throw { message: 'Kein Schreibzugriff' }
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete state.file[key]
        else state.file[key] = value
      }
      return { ...state.file }
    }),
  }
}

async function renderSection(client: ReturnType<typeof createClient>, permission?: VaultInfo['permission']) {
  _reset()
  initialize(client as unknown as IApiClient)
  await setActiveVault('v1')
  return render(
    <AppProvider apiClient={client as unknown as IApiClient}>
      <VaultSeeder permission={permission} />
      <EditorFilesSection />
    </AppProvider>,
  )
}

describe('attachment path helpers', () => {
  it('parses Obsidian’s four spellings', () => {
    expect(parseAttachmentPath('/')).toEqual({ mode: 'root', name: '' })
    expect(parseAttachmentPath('./')).toEqual({ mode: 'note', name: '' })
    expect(parseAttachmentPath('')).toEqual({ mode: 'note', name: '' })
    expect(parseAttachmentPath('./attachments')).toEqual({ mode: 'subfolder', name: 'attachments' })
    expect(parseAttachmentPath('Assets/img')).toEqual({ mode: 'folder', name: 'Assets/img' })
  })

  it('builds them back, tidying slashes and empty names', () => {
    expect(buildAttachmentPath('root', 'x')).toBe('/')
    expect(buildAttachmentPath('note', 'x')).toBe('./')
    expect(buildAttachmentPath('subfolder', ' att/ ')).toBe('./att')
    expect(buildAttachmentPath('subfolder', '')).toBe('./')
    expect(buildAttachmentPath('folder', '/Assets/')).toBe('Assets')
    expect(buildAttachmentPath('folder', '')).toBe('/')
  })
})

describe('EditorFilesSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the values of the vault’s app.json', async () => {
    await renderSection(createClient({ attachmentFolderPath: './attachments', readableLineLength: false, showLineNumber: true }))

    expect(screen.getByLabelText('Speicherort')).toHaveValue('subfolder')
    expect(screen.getByLabelText('Name des Unterordners')).toHaveValue('attachments')
    expect(screen.getByLabelText('Lesbare Zeilenlänge')).not.toBeChecked()
    expect(screen.getByLabelText('Zeilennummern')).toBeChecked()
    expect(screen.getByLabelText('Rechtschreibprüfung')).toBeChecked()
  })

  it('shows and saves the editor, folding, new-note and delete settings', async () => {
    const client = createClient({ tabSize: 2, useTab: false, strictLineBreaks: true, newFileLocation: 'folder', newFileFolderPath: 'Inbox' })
    await renderSection(client)

    expect(screen.getByLabelText('Mit Tabulator einrücken')).not.toBeChecked()
    expect(screen.getByLabelText('Tabulatorbreite')).toHaveValue(2)
    expect(screen.getByLabelText('Strikte Zeilenumbrüche')).toBeChecked()
    expect(screen.getByLabelText('Notizen öffnen in')).toHaveValue('preview') // an absent key reads, as in the tab reducer
    expect(screen.getByLabelText('Ordner für neue Notizen')).toHaveValue('Inbox')
    expect(screen.getByLabelText('Vor dem Löschen nachfragen')).toBeChecked()

    fireEvent.change(screen.getByLabelText('Notizen öffnen in'), { target: { value: 'source' } })
    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { defaultViewMode: 'source' }))
    fireEvent.click(screen.getByLabelText('Vor dem Löschen nachfragen'))
    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { promptDelete: false }))
    fireEvent.click(screen.getByLabelText('Überschriften falten'))
    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { foldHeading: false }))
  })

  it('saves a valid tab width on blur and puts back an invalid one', async () => {
    const client = createClient()
    await renderSection(client)
    const input = screen.getByLabelText('Tabulatorbreite')

    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    expect(client.patchAppConfig).not.toHaveBeenCalled()
    expect(input).toHaveValue(4)

    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)
    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { tabSize: 3 }))
  })

  it('hides the folder field unless new notes go to a fixed folder', async () => {
    await renderSection(createClient())
    expect(screen.queryByLabelText('Ordner für neue Notizen')).toBeNull()
  })

  it('saves a toggle at once, keeping other keys of the file', async () => {
    const client = createClient({ vimMode: true })
    await renderSection(client)

    fireEvent.click(screen.getByLabelText('Zeilennummern'))

    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { showLineNumber: true }))
    expect(client.state.file).toEqual({ vimMode: true, showLineNumber: true })
  })

  it('saves the attachment location only after pressing Speichern', async () => {
    const client = createClient()
    await renderSection(client)
    const save = screen.getByRole('button', { name: 'Speichern' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Speicherort'), { target: { value: 'folder' } })
    fireEvent.change(screen.getByLabelText('Ordner'), { target: { value: 'Anhänge' } })
    expect(client.patchAppConfig).not.toHaveBeenCalled()
    fireEvent.click(save)

    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { attachmentFolderPath: 'Anhänge' }))
  })

  it('reports a refused save and keeps the old value', async () => {
    await renderSection(createClient({}, true))

    fireEvent.click(screen.getByLabelText('Lesbare Zeilenlänge'))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('Kein Schreibzugriff')))
    await waitFor(() => expect(screen.getByLabelText('Lesbare Zeilenlänge')).toBeChecked())
  })

  it('is read-only for collaborators with read access', async () => {
    await renderSection(createClient(), 'read')

    expect(await screen.findByText(/Ändern darf sie/)).toBeInTheDocument()
    expect(screen.getByLabelText('Zeilennummern')).toBeDisabled()
    expect(screen.getByLabelText('Speicherort')).toBeDisabled()
  })

  it('has no axe violations', async () => {
    const { container } = await renderSection(createClient({ attachmentFolderPath: 'Assets' }))
    expect(await axe(container)).toHaveNoViolations()
  }, 30_000)
})
