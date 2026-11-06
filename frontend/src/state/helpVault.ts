/**
 * helpVault — backs `app:open-help`. Obsidian opens its help site; Slatebase's
 * guide is the welcome (tutorial) vault, so the command opens that vault's start
 * note, creating the vault first when the user has none.
 *
 * @module state/helpVault
 */

/** Start note of each welcome-vault template (`backend/assets/templates/welcome-vault*`). */
export const HELP_START_NOTES = {
  de: 'Start hier.md',
  en: 'Start here.md',
} as const

export type HelpLanguage = keyof typeof HELP_START_NOTES

/** Default welcome-vault names (`backend/config/default.json` → `welcomeVault.name`). */
const HELP_VAULT_NAMES: Record<string, HelpLanguage> = {
  Willkommen: 'de',
  Welcome: 'en',
}

/**
 * Which template language a vault name belongs to, or `null` when it is not a
 * welcome vault. Matches the backend's deduplicated names (`Welcome (2)`).
 *
 * shortcut: recognizes only the default names; an admin-renamed welcome vault
 * is not found and the command creates a new one. Upgrade when the vault list
 * carries a "created from template" marker.
 */
export function helpVaultLanguage(vaultName: string): HelpLanguage | null {
  const base = vaultName.replace(/ \(\d+\)$/, '')
  return HELP_VAULT_NAMES[base] ?? null
}

/**
 * The welcome vault to open for help: the first one in the user's language,
 * else any welcome vault, else `null`.
 */
export function findHelpVault<V extends { id: string; name: string }>(
  vaults: readonly V[],
  preferred: HelpLanguage,
): { vault: V; language: HelpLanguage } | null {
  let fallback: { vault: V; language: HelpLanguage } | null = null
  for (const vault of vaults) {
    const language = helpVaultLanguage(vault.name)
    if (!language) continue
    if (language === preferred) return { vault, language }
    fallback ??= { vault, language }
  }
  return fallback
}
