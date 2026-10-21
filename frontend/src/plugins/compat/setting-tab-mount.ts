/**
 * Mounting a plugin's settings tab. Obsidian attaches `tab.containerEl` to the settings dialog *before* it calls
 * `tab.display()`, and plugins depend on that: Style Settings' `setSettings()` only renders `if (containerEl.parentNode)`,
 * so a tab rendered while still detached stays empty. This helper keeps that order in one place.
 */

/** Minimal shape of a settings tab as far as mounting is concerned. */
export interface MountableSettingTab {
  containerEl: HTMLElement
}

/**
 * Attaches the tab's container to `host`, then runs `render` (the tab's `display()` or a declarative renderer).
 *
 * @param host - Element inside the (already visible) settings dialog.
 * @param tab - The plugin's settings tab.
 * @param render - Draws the tab into `tab.containerEl`; runs only after the container is attached to the document.
 */
export function mountSettingTab(host: HTMLElement, tab: MountableSettingTab, render: () => void): void {
  host.innerHTML = ''
  host.appendChild(tab.containerEl)
  tab.containerEl.innerHTML = ''
  render()
}

/**
 * Resolves with the element returned by `get()` as soon as it exists, checking once per animation frame.
 * Used to wait for React to render the dialog body that hosts the tab. Gives up after `maxFrames` and returns null.
 */
export function waitForElement<T extends HTMLElement>(get: () => T | null, maxFrames = 30): Promise<T | null> {
  return new Promise((resolve) => {
    let frames = 0
    const check = (): void => {
      const element = get()
      if (element !== null || frames >= maxFrames) {
        resolve(element)
        return
      }
      frames += 1
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}
