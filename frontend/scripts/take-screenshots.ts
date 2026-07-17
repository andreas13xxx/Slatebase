/**
 * Playwright script to capture 22 screenshots of the Slatebase UI.
 * Run with: npx tsx scripts/take-screenshots.ts
 *
 * Prerequisites:
 * - Backend running on http://localhost:3000
 * - Frontend running on http://localhost:5173
 * - User "Slate" with password "Slatebase" exists
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

const BASE_URL = 'http://localhost:5173'
const USERNAME = 'Slate'
const PASSWORD = 'Slatebase'

const OUTPUT_DIR_DE = path.resolve(
  'd:\\Users\\BKU\\AndreasAnScholz\\OneDrive - Deutsche Bahn\\Kiro\\Slatebase\\backend\\data\\templates\\welcome-vault\\Screenshots'
)
const OUTPUT_DIR_EN = path.resolve(
  'd:\\Users\\BKU\\AndreasAnScholz\\OneDrive - Deutsche Bahn\\Kiro\\Slatebase\\backend\\data\\templates\\welcome-vault-en\\Screenshots'
)

// Ensure output directories exist
fs.mkdirSync(OUTPUT_DIR_DE, { recursive: true })
fs.mkdirSync(OUTPUT_DIR_EN, { recursive: true })

async function saveScreenshot(page: Page, filename: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png' })
  const dePath = path.join(OUTPUT_DIR_DE, filename)
  const enPath = path.join(OUTPUT_DIR_EN, filename)
  fs.writeFileSync(dePath, buffer)
  fs.writeFileSync(enPath, buffer)
  console.log(`  ✓ ${filename}`)
}

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL)
  // Wait for login page to load
  await page.waitForSelector('input[type="text"], input[name="username"], input[placeholder*="Benutzer"], input[placeholder*="User"]', { timeout: 10000 })
  
  // Fill login form
  const usernameInput = page.locator('input[type="text"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  
  await usernameInput.fill(USERNAME)
  await passwordInput.fill(PASSWORD)
  
  // Submit
  const submitButton = page.locator('button[type="submit"]')
  await submitButton.click()
  
  // Wait for app to load (file explorer should appear)
  await page.waitForSelector('.file-explorer, [class*="file-explorer"], [class*="FileExplorer"]', { timeout: 15000 })
  await page.waitForTimeout(2000) // Let the UI settle
}

async function expandFileExplorer(page: Page): Promise<void> {
  // Click on vault entries to expand them
  const vaultHeaders = page.locator('.file-explorer .tree-node--directory, [class*="vault-entry"], [class*="tree-node"] >> text=/Willkommen|Welcome/')
  const count = await vaultHeaders.count()
  if (count > 0) {
    await vaultHeaders.first().click()
    await page.waitForTimeout(1000)
  }
  
  // Try expanding some subfolders
  const folders = page.locator('.tree-node--directory, [class*="tree-node--dir"]')
  const folderCount = await folders.count()
  for (let i = 0; i < Math.min(folderCount, 4); i++) {
    try {
      const folder = folders.nth(i)
      const isExpanded = await folder.getAttribute('data-expanded')
      if (isExpanded !== 'true') {
        await folder.click()
        await page.waitForTimeout(300)
      }
    } catch { /* skip */ }
  }
}

async function openFile(page: Page, filename: string): Promise<void> {
  // Search for a file by name in the explorer tree
  const fileNode = page.locator(`.tree-node--file, [class*="tree-node"]`).filter({ hasText: filename })
  const count = await fileNode.count()
  if (count > 0) {
    await fileNode.first().dblclick()
    await page.waitForTimeout(1500)
  }
}

async function openMultipleTabs(page: Page): Promise<void> {
  // Open several files to get multiple tabs
  const files = page.locator('.tree-node--file, [class*="tree-node--file"]')
  const count = await files.count()
  for (let i = 0; i < Math.min(count, 4); i++) {
    try {
      await files.nth(i).dblclick()
      await page.waitForTimeout(800)
    } catch { /* skip */ }
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Slatebase screenshot capture...\n')
  
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  })
  
  let context: BrowserContext
  let page: Page
  
  try {
    // Full-size viewport for most screenshots
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark',
    })
    page = await context.newPage()
    
    // Login
    console.log('📝 Logging in...')
    await login(page)
    console.log('✓ Logged in successfully\n')
    
    // Expand file explorer
    await expandFileExplorer(page)
    await page.waitForTimeout(1000)
    
    // --- Screenshot 1: gesamtansicht.png ---
    console.log('📸 Taking screenshots...\n')
    await saveScreenshot(page, 'gesamtansicht.png')
    
    // --- Screenshot 2: datei-explorer.png ---
    // Focus on the file explorer area (take full page, explorer is visible)
    await saveScreenshot(page, 'datei-explorer.png')
    
    // --- Screenshot 3: datei-explorer-kontextmenu.png ---
    // Right-click on a file to show context menu
    const fileForContext = page.locator('.tree-node--file, [class*="tree-node--file"]').first()
    if (await fileForContext.count() > 0) {
      await fileForContext.click({ button: 'right' })
      await page.waitForTimeout(500)
    }
    await saveScreenshot(page, 'datei-explorer-kontextmenu.png')
    // Close context menu
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // --- Screenshot 4: editor-toolbar.png ---
    // Open a file in edit mode to show toolbar
    await openFile(page, 'Start hier')
    await page.waitForTimeout(1000)
    // Click edit button if exists
    const editButton = page.locator('button[title*="Bearbeiten"], button[aria-label*="Edit"], button[title*="Edit"], .tab-actions button').first()
    if (await editButton.count() > 0) {
      await editButton.click()
      await page.waitForTimeout(500)
    }
    await saveScreenshot(page, 'editor-toolbar.png')
    
    // --- Screenshot 5: viewer-formatiert.png ---
    // Switch to view mode
    const viewButton = page.locator('button[title*="Ansicht"], button[title*="Vorschau"], button[aria-label*="View"], button[title*="View"]').first()
    if (await viewButton.count() > 0) {
      await viewButton.click()
      await page.waitForTimeout(1000)
    }
    await saveScreenshot(page, 'viewer-formatiert.png')
    
    // --- Screenshot 6: tabs-mehrere.png ---
    await openMultipleTabs(page)
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'tabs-mehrere.png')
    
    // --- Screenshot 7: knowledge-graph.png ---
    // Open graph view via command palette or button
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput.count() > 0) {
      await paletteInput.fill('Graph')
      await page.waitForTimeout(500)
      // Click the first result
      const graphResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await graphResult.count() > 0) {
        await graphResult.click()
        await page.waitForTimeout(2000)
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'knowledge-graph.png')
    
    // --- Screenshot 8: context-panel.png ---
    // Navigate back to a file to show context panel
    await openFile(page, 'Start hier')
    await page.waitForTimeout(1000)
    await saveScreenshot(page, 'context-panel.png')
    
    // --- Screenshot 9: suche-ergebnisse.png ---
    // Open search with Ctrl+Shift+F
    await page.keyboard.press('Control+Shift+f')
    await page.waitForTimeout(500)
    const searchInput = page.locator('.search-panel input, [class*="search-panel"] input, [class*="SearchPanel"] input').first()
    if (await searchInput.count() > 0) {
      await searchInput.fill('Markdown')
      await page.waitForTimeout(1500) // Wait for debounced search
    }
    await saveScreenshot(page, 'suche-ergebnisse.png')
    // Close search
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // --- Screenshot 10: settings-panel.png ---
    // Open settings with Ctrl+,
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(1000)
    await saveScreenshot(page, 'settings-panel.png')
    // Close settings
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // --- Screenshot 11: canvas-nodes.png ---
    // Try to open a canvas file if one exists, otherwise skip
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput2 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput2.count() > 0) {
      await paletteInput2.fill('canvas')
      await page.waitForTimeout(500)
      const canvasResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await canvasResult.count() > 0) {
        await canvasResult.click()
        await page.waitForTimeout(2000)
      } else {
        await page.keyboard.press('Escape')
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'canvas-nodes.png')
    
    // --- Screenshot 12: command-palette.png ---
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput3 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput3.count() > 0) {
      await paletteInput3.fill('Datei')
      await page.waitForTimeout(500)
    }
    await saveScreenshot(page, 'command-palette.png')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // --- Screenshot 13: mermaid-diagramm.png ---
    // Open the Mermaid file
    await openFile(page, 'Mermaid')
    await page.waitForTimeout(2000) // Wait for mermaid to render
    // Make sure we're in view mode
    const viewButton2 = page.locator('button[title*="Ansicht"], button[title*="Vorschau"], button[aria-label*="View"]').first()
    if (await viewButton2.count() > 0) {
      await viewButton2.click()
      await page.waitForTimeout(2000)
    }
    await saveScreenshot(page, 'mermaid-diagramm.png')
    
    // --- Screenshot 14: callout-typen.png ---
    // Open the Callouts file
    await openFile(page, 'Callouts')
    await page.waitForTimeout(2000)
    // Make sure we're in view mode
    const viewButton3 = page.locator('button[title*="Ansicht"], button[title*="Vorschau"], button[aria-label*="View"]').first()
    if (await viewButton3.count() > 0) {
      await viewButton3.click()
      await page.waitForTimeout(1500)
    }
    await saveScreenshot(page, 'callout-typen.png')
    
    // --- Screenshot 15: dark-mode.png ---
    // Already in dark mode
    await openFile(page, 'Start hier')
    await page.waitForTimeout(1000)
    await saveScreenshot(page, 'dark-mode.png')
    
    // --- Screenshot 16: light-mode.png ---
    // Switch to light mode via settings or by toggling
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'light-mode.png')
    // Switch back to dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.waitForTimeout(300)
    
    // --- Screenshot 17: wikilink-autocomplete.png ---
    // Open a file with wikilinks in view mode
    await openFile(page, 'Wikilinks')
    await page.waitForTimeout(1500)
    const viewButton4 = page.locator('button[title*="Ansicht"], button[title*="Vorschau"], button[aria-label*="View"]').first()
    if (await viewButton4.count() > 0) {
      await viewButton4.click()
      await page.waitForTimeout(1000)
    }
    await saveScreenshot(page, 'wikilink-autocomplete.png')
    
    // --- Screenshot 18: papierkorb.png ---
    // Try to open Trash view via command palette
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput4 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput4.count() > 0) {
      await paletteInput4.fill('Papierkorb')
      await page.waitForTimeout(500)
      const trashResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await trashResult.count() > 0) {
        await trashResult.click()
        await page.waitForTimeout(1500)
      } else {
        await page.keyboard.press('Escape')
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'papierkorb.png')
    
    // --- Screenshot 19: version-diff.png ---
    // Try to open version browser - open a file first, then look for version button
    await openFile(page, 'Start hier')
    await page.waitForTimeout(1000)
    const versionButton = page.locator('button[title*="Version"], button[aria-label*="version"], button[title*="Historie"]').first()
    if (await versionButton.count() > 0) {
      await versionButton.click()
      await page.waitForTimeout(1500)
    }
    await saveScreenshot(page, 'version-diff.png')
    
    // --- Screenshot 20: sync-status.png ---
    // Try to navigate to sync page
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput5 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput5.count() > 0) {
      await paletteInput5.fill('Sync')
      await page.waitForTimeout(500)
      const syncResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await syncResult.count() > 0) {
        await syncResult.click()
        await page.waitForTimeout(1500)
      } else {
        await page.keyboard.press('Escape')
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'sync-status.png')
    
    // --- Screenshot 21: chat-ansicht.png ---
    // Try to navigate to chat page
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput6 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput6.count() > 0) {
      await paletteInput6.fill('Chat')
      await page.waitForTimeout(500)
      const chatResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await chatResult.count() > 0) {
        await chatResult.click()
        await page.waitForTimeout(1500)
      } else {
        await page.keyboard.press('Escape')
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'chat-ansicht.png')
    
    // --- Screenshot 22: template-auswahl.png ---
    // Try to open template selector via command palette
    await page.keyboard.press('Control+p')
    await page.waitForTimeout(500)
    const paletteInput7 = page.locator('.command-palette input, [class*="command-palette"] input, [class*="CommandPalette"] input')
    if (await paletteInput7.count() > 0) {
      await paletteInput7.fill('Vorlage')
      await page.waitForTimeout(500)
      const templateResult = page.locator('.command-palette-item, [class*="command-item"], [class*="palette-item"]').first()
      if (await templateResult.count() > 0) {
        await templateResult.click()
        await page.waitForTimeout(1500)
      } else {
        await page.keyboard.press('Escape')
      }
    } else {
      await page.keyboard.press('Escape')
    }
    await saveScreenshot(page, 'template-auswahl.png')
    
    console.log('\n✅ All 22 screenshots captured successfully!')
    console.log(`📁 Output (DE): ${OUTPUT_DIR_DE}`)
    console.log(`📁 Output (EN): ${OUTPUT_DIR_EN}`)
    
  } catch (error) {
    console.error('❌ Error during screenshot capture:', error)
    throw error
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
