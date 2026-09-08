/**
 * Golden-path smoke test: login -> select/create a vault -> open a file ->
 * edit -> save -> reload -> content survived.
 *
 * This is deliberately the one E2E scenario that must never break — it
 * touches auth, the session cookie, CSRF, SSE-backed state, the CM6 editor,
 * and on-disk persistence in one pass. See playwright.config.ts for how the
 * backend is started (a fresh, isolated data directory per run).
 */
import { test, expect, type Page } from '@playwright/test'

const ADMIN_USER = 'admin'
const ADMIN_DEFAULT_PASSWORD = 'admin'
// Only ever used against the disposable, isolated E2E backend instance
// started fresh per run by playwright.config.ts — not a real credential.
const ADMIN_NEW_PASSWORD = 'e2e-smoke-test-password-1' // gitleaks:allow

/**
 * Logs in as the default admin and clears the forced first-login password
 * change. Handles a CI retry within the same job re-running this test against
 * a backend an earlier attempt already rotated the password on: a rejected
 * login with the default password falls back to the rotated one.
 *
 * Argon2 hashing (see ensureDefaultAdmin) makes login itself slow, so this
 * waits on the login response's outcome rather than a fixed delay or a
 * fire-and-forget isVisible() check.
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('#login-username').fill(ADMIN_USER)
  await page.locator('#login-password').fill(ADMIN_DEFAULT_PASSWORD)
  await page.locator('button[type="submit"]').click()

  const outcome = await Promise.race([
    page.locator('#change-new-password').waitFor({ state: 'visible', timeout: 20000 }).then(() => 'change-password' as const),
    page.locator('.app-vault-layout').waitFor({ state: 'visible', timeout: 20000 }).then(() => 'app' as const),
    page.locator('.login-error').waitFor({ state: 'visible', timeout: 20000 }).then(() => 'error' as const),
  ])

  if (outcome === 'error') {
    await page.locator('#login-password').fill(ADMIN_NEW_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.locator('.app-vault-layout').waitFor({ state: 'visible', timeout: 20000 })
    return
  }

  if (outcome === 'change-password') {
    await page.locator('#change-current-password').fill(ADMIN_DEFAULT_PASSWORD)
    await page.locator('#change-new-password').fill(ADMIN_NEW_PASSWORD)
    await page.locator('#change-confirm-password').fill(ADMIN_NEW_PASSWORD)
    await page.locator('.login-submit').click()
    await page.locator('.app-vault-layout').waitFor({ state: 'visible', timeout: 20000 })
  }
}

test('login, edit a file, save, reload, content persists', async ({ page }) => {
  const runId = Date.now()
  const vaultName = `E2E-${runId}`
  const fileName = `smoke-${runId}.md`
  const editedText = `Smoke test content ${runId}`

  await loginAsAdmin(page)

  // --- Create + select a vault (fresh backend has none yet) ---
  await page.locator('.toolbar-btn[title="Neuer Vault"]').click()
  await page.locator('.file-explorer-create-vault-input').fill(vaultName)
  await page.locator('.file-explorer-create-vault-submit').click()
  await expect(page.locator('.file-explorer-create-vault-input')).toHaveCount(0)

  // --- Create a file (auto-opens as a tab) ---
  await page.locator('.toolbar-btn[title="Neue Datei"]').click()
  const inlineInput = page.locator('.inline-input')
  await inlineInput.fill(fileName)
  await inlineInput.press('Enter')

  // --- Switch to Edit mode and type content ---
  await page.locator('.tab-bar-mode-btn').first().click()
  const editorContent = page.locator('.cm-content')
  await editorContent.click()
  await editorContent.pressSequentially(editedText, { delay: 10 })

  // Auto-save debounce (see EditMode.tsx) — wait for the status indicator
  // rather than a fixed delay.
  await expect(page.locator('.edit-mode-status--saved')).toBeVisible({ timeout: 10000 })

  // --- Reload and verify the content survived ---
  await page.reload()
  await page.waitForSelector('.app-vault-layout', { timeout: 15000 })

  // The tree displays file names without their extension.
  const fileNode = page.locator('.tree-node-file').filter({ hasText: String(runId) }).first()
  await fileNode.click()

  const editToggle = page.locator('.tab-bar-mode-btn').first()
  if (await editToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editToggle.click()
  }

  await expect(page.locator('.cm-content')).toContainText(editedText, { timeout: 10000 })
})
