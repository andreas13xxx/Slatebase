import { describe, it, expect, vi } from 'vitest'
import { buildSettingsNavCommands } from './settingsNavCommands'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import type { TranslateFn, TranslationKey } from '../i18n'

function translator(dict: typeof de | typeof en): TranslateFn {
  return (key: TranslationKey) =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], dict) as string
}

describe('buildSettingsNavCommands', () => {
  it('opens the settings dialog at the profile, sessions and my-vaults sections', () => {
    const onOpenSettings = vi.fn()
    const commands = buildSettingsNavCommands(translator(de), onOpenSettings)

    expect(commands.map((c) => c.id)).toEqual([
      'slatebase:navigate-profile',
      'slatebase:navigate-sessions',
      'slatebase:navigate-my-vaults',
    ])

    for (const command of commands) command.callback()

    expect(onOpenSettings.mock.calls).toEqual([
      [{ category: 'account', section: 'profile' }],
      [{ category: 'account', section: 'sessions' }],
      [{ category: 'account', section: 'my-vaults' }],
    ])
  })

  it('translates the command names', () => {
    const german = buildSettingsNavCommands(translator(de), vi.fn()).map((c) => c.name)
    const english = buildSettingsNavCommands(translator(en), vi.fn()).map((c) => c.name)

    expect(german).toEqual(['Profil', 'Sitzungen', 'Meine Vaults'])
    expect(english).toEqual(['Profile', 'Sessions', 'My Vaults'])
  })
})
