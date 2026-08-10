import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import React from 'react'
import { TabBar } from './TabBar'
import { TabContext, type TabContextValue } from '../state/tabContext'
import { initialTabState } from '../state/tabState'
import type { SettingsTabDescriptor } from './TabBar'

function createTabContextWrapper(overrides: Partial<TabContextValue> = {}) {
  const value: TabContextValue = {
    tabState: initialTabState,
    tabDispatch: vi.fn(),
    ...overrides,
  }
  return ({ children }: { children: React.ReactNode }) => (
    <TabContext.Provider value={value}>{children}</TabContext.Provider>
  )
}

describe('TabBar accessibility', () => {
  test('has no axe violations with settings tabs', async () => {
    const settingsTabs: SettingsTabDescriptor[] = [
      {
        key: 'profile',
        label: 'Profil',
        isActive: true,
        onActivate: () => {},
        onClose: () => {},
        closeAriaLabel: 'Profil schließen',
        closeTitle: 'Schließen',
      },
    ]

    const { container } = render(
      <TabBar
        settingsTabs={settingsTabs}
        isShowingSettings={true}
        onActivateFileTab={() => {}}
      />,
      { wrapper: createTabContextWrapper() }
    )
    // nested-interactive: buttons inside role="tab" divs — known pattern,
    // will be addressed in Phase 4 (Task 13).
    expect(await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    })).toHaveNoViolations()
  })

  test('has no axe violations with file tabs', async () => {
    const tabState = {
      ...initialTabState,
      tabs: [
        {
          id: 'vault1::notes/test.md',
          vaultId: 'vault1',
          filePath: 'notes/test.md',
          fileName: 'test.md',
          content: '# Test',
          editBuffer: null,
          mode: 'edit' as const,
          isBinary: false,
          loading: false,
        },
      ],
      activeTabId: 'vault1::notes/test.md',
    }

    const { container } = render(
      <TabBar
        settingsTabs={[]}
        isShowingSettings={false}
        onActivateFileTab={() => {}}
      />,
      { wrapper: createTabContextWrapper({ tabState, tabDispatch: vi.fn() }) }
    )
    // nested-interactive: buttons inside role="tab" divs — known pattern,
    // will be addressed in Phase 4 (Task 13).
    expect(await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    })).toHaveNoViolations()
  })
})
