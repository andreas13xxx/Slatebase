/**
 * Playwright script to record a demo video of Slatebase.
 *
 * Prerequisites:
 *   - Backend running on localhost:3000
 *   - Frontend running on localhost:5173
 *
 * Usage:
 *   cd frontend
 *   set DEMO_USER=admin
 *   set DEMO_PASS=ndy1213Slatebase!
 *   npx playwright test e2e/demo-recording.spec.ts --headed --reporter=list
 *
 * Output:
 *   frontend/test-results/demo-recording-Slatebase-Demo-Recording-chromium/video.webm
 *
 * Convert to GIF (requires ffmpeg):
 *   ffmpeg -i video.webm -vf "fps=12,scale=800:-1:flags=lanczos" -loop 0 demo.gif
 */
import { test } from '@playwright/test'

const DEMO_USER = process.env['DEMO_USER'] || 'admin'
const DEMO_PASS = process.env['DEMO_PASS'] || 'admin'

test.use({
  viewport: { width: 1280, height: 720 },
  video: {
    mode: 'on',
    size: { width: 1280, height: 720 },
  },
  launchOptions: {
    slowMo: 40,
  },
})

test('Slatebase Demo Recording', async ({ page }) => {
  test.setTimeout(120000) // 2 min timeout for the full demo

  const wait = (ms: number) => page.waitForTimeout(ms)

  // --- 1. Login Page ---
  await page.goto('/')
  await page.waitForSelector('#login-username', { timeout: 10000 })
  await wait(1000)

  await page.locator('#login-username').click()
  await page.locator('#login-username').type(DEMO_USER, { delay: 50 })
  await wait(300)
  await page.locator('#login-password').click()
  await page.locator('#login-password').type(DEMO_PASS, { delay: 35 })
  await wait(500)
  await page.locator('button[type="submit"]').click()
  await wait(2500)

  // --- 2. Wait for main app ---
  await page.waitForSelector('.app', { timeout: 15000 })
  await wait(1500)

  // --- 3. Select the "Test" vault ---
  const vaultTrigger = page.locator('.vault-dropdown-trigger').first()
  if (await vaultTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await vaultTrigger.click()
    await wait(600)
    const testVault = page.locator('.vault-dropdown-item-btn').filter({ hasText: 'Test' }).first()
    if (await testVault.isVisible({ timeout: 3000 }).catch(() => false)) {
      await testVault.click()
      await wait(2000)
    }
  }

  // --- 4. File Explorer - Expand folders ---
  await wait(800)
  const folderToggle = page.locator('button.tree-node-toggle').first()
  if (await folderToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
    await folderToggle.click()
    await wait(800)

    const subFolderToggle = page.locator('button.tree-node-toggle').nth(1)
    if (await subFolderToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await subFolderToggle.click()
      await wait(600)
    }
  }

  // --- 5. Open a Markdown file (View Mode) ---
  const fileBtn = page.locator('button.tree-node-file').first()
  if (await fileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fileBtn.click()
    await wait(2000)

    // Scroll down in the view to show rendered markdown
    const contentArea = page.locator('.tab-content-area, .view-mode, .markdown-body').first()
    if (await contentArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contentArea.evaluate((el) => el.scrollBy({ top: 200, behavior: 'smooth' }))
      await wait(1000)
      await contentArea.evaluate((el) => el.scrollBy({ top: -200, behavior: 'smooth' }))
      await wait(800)
    }
  }

  // --- 6. Open a second file to show tabs ---
  const secondFile = page.locator('button.tree-node-file').nth(1)
  if (await secondFile.isVisible({ timeout: 2000 }).catch(() => false)) {
    await secondFile.click()
    await wait(1500)
  }

  // Switch back to first tab
  const firstTab = page.locator('.tab-bar-tab').first()
  if (await firstTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstTab.click()
    await wait(1000)
  }

  // --- 7. Switch to Edit Mode ---
  const editToggle = page.locator('.tab-bar-mode-btn').first()
  if (await editToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editToggle.click()
    await wait(1500)

    // Type some demo text
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.click()
      await textarea.press('Control+End')
      await wait(300)
      await textarea.press('Enter')
      await textarea.press('Enter')
      await textarea.type('## Demo-Eintrag\n\nDieser Text wurde in der Demo hinzugefuegt.', { delay: 25 })
      await wait(2000) // Auto-save
    }

    // Switch back to View mode to show rendered result
    const viewToggle = page.locator('.tab-bar-mode-btn').first()
    if (await viewToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await viewToggle.click()
      await wait(1500)
    }
  }

  // --- 8. Navigate to Profile page ---
  const profileBtn = page.locator('.toolbar-btn[title="Profil"]')
  if (await profileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await profileBtn.click()
    await wait(2000)
  }

  // --- 9. Navigate to Sessions page ---
  const sessionsBtn = page.locator('.toolbar-btn[title="Sitzungen"]')
  if (await sessionsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sessionsBtn.click()
    await wait(2000)
  }

  // --- 10. Navigate to Admin Users page ---
  const adminUsersBtn = page.locator('.toolbar-btn[title="Benutzerverwaltung"]')
  if (await adminUsersBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await adminUsersBtn.click()
    await wait(2000)
  }

  // --- 11. Navigate to Meine Vaults and share with Andreas ---
  const myVaultsBtn = page.locator('.toolbar-btn[title="Meine Vaults"]')
  if (await myVaultsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await myVaultsBtn.click()
    await wait(2000)

    // Find the "Test" vault and click its share button
    const testVaultRow = page.locator('.my-vaults-list li').filter({ hasText: 'Test' }).first()
    if (await testVaultRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      const shareBtn = testVaultRow.locator('.my-vaults-share-btn')
      if (await shareBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shareBtn.click()
        await wait(1000)

        // Type "Andreas" in the add-share input
        const shareInput = testVaultRow.locator('.my-vaults-add-share-input')
        if (await shareInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await shareInput.click()
          await shareInput.type('Andreas', { delay: 50 })
          await wait(800) // Wait for autocomplete suggestions

          // Click the suggestion for "Andreas"
          const suggestion = page.locator('.my-vaults-add-share-suggestion, [class*="suggestion"]').filter({ hasText: 'Andreas' }).first()
          if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
            await suggestion.click()
            await wait(500)
          }

          // Submit the share form
          const addShareBtn = testVaultRow.locator('.my-vaults-add-share button[type="submit"], .my-vaults-add-share-submit')
          if (await addShareBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await addShareBtn.click()
            await wait(2000)
          }
        }
      }
    }
  }

  // --- 12. Navigate to Server Config ---
  const configBtn = page.locator('.toolbar-btn[title="Serverkonfiguration"]')
  if (await configBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await configBtn.click()
    await wait(2000)
  }

  // --- 13. Navigate to Audit Log ---
  const auditBtn = page.locator('.toolbar-btn[title="Audit-Log"]')
  if (await auditBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await auditBtn.click()
    await wait(2000)
  }

  // --- 14. Go back to vault view (click a file tab) ---
  const fileTab = page.locator('.tab-bar-tab').first()
  if (await fileTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fileTab.click()
    await wait(1500)
  }

  // --- 15. Final pause ---
  await wait(2000)
})
