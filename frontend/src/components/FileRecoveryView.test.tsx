import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FileRecoveryView } from './FileRecoveryView'
import type { IApiClient } from '../api'

vi.mock('./VersionBrowser', () => ({
  VersionBrowser: (props: { filePath: string; currentContent: string; onRestore?: () => void }) => (
    <div>
      <span data-testid="browser">{props.filePath}|{props.currentContent}</span>
      <button type="button" onClick={() => props.onRestore?.()}>restore</button>
    </div>
  ),
}))

function createMockApiClient(fetchFileContent: ReturnType<typeof vi.fn>): IApiClient {
  return { fetchFileContent } as unknown as IApiClient
}

describe('FileRecoveryView', () => {
  it('loads the current content and hands it to the version browser', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({ content: 'now', isBinary: false })
    render(<FileRecoveryView vaultId="v" filePath="a.md" apiClient={createMockApiClient(fetchFileContent)} onRestored={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('browser')).toHaveTextContent('a.md|now'))
    expect(fetchFileContent).toHaveBeenCalledWith('v', 'a.md')
  })

  it('shows an alert when the file cannot be loaded', async () => {
    const fetchFileContent = vi.fn().mockRejectedValue(new Error('boom'))
    render(<FileRecoveryView vaultId="v" filePath="a.md" apiClient={createMockApiClient(fetchFileContent)} onRestored={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('reloads the file after a restore and reports the restored content', async () => {
    const fetchFileContent = vi.fn()
      .mockResolvedValueOnce({ content: 'old', isBinary: false })
      .mockResolvedValueOnce({ content: 'restored', isBinary: false })
    const onRestored = vi.fn()
    render(<FileRecoveryView vaultId="v" filePath="a.md" apiClient={createMockApiClient(fetchFileContent)} onRestored={onRestored} />)
    await screen.findByTestId('browser')
    screen.getByRole('button', { name: 'restore' }).click()
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith('restored'))
  })
})
