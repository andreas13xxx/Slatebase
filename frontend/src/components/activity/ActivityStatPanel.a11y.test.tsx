import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ActivityStatPanel } from './ActivityStatPanel'
import type { IApiClient } from '../../api'
import type { ActivityEvent } from '../../types'

function evt(type: ActivityEvent['type']): ActivityEvent {
  const ts = new Date().toISOString()
  return { id: Math.random().toString(16).slice(2), type, timestamp: ts, lastModified: ts, path: 'x.md', user: 'u' }
}

const apiClient = {
  getActivity: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
} as unknown as IApiClient

describe('ActivityStatPanel accessibility', () => {
  test('has no axe violations', async () => {
    const { container } = render(
      <ActivityStatPanel
        events={[evt('note.created'), evt('note.edited'), evt('sync.completed')]}
        heatmapEvents={[evt('note.created')]}
        range="week"
        onRangeChange={() => {}}
        apiClient={apiClient}
        vaultId="vault-1"
        dispatch={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
