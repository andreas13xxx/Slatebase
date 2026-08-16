/**
 * Behaviour of the `ConfirmationModal`/`ConfirmationButton` shims (Obsidian
 * API since 1.13.0), registered by `installObsidianGlobals()`.
 */
import { describe, it, expect, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'

installObsidianGlobals()

interface ConfirmationButtonLike {
  buttonEl: HTMLButtonElement
  setButtonText(text: string): ConfirmationButtonLike
  onClick(handler: (evt: MouseEvent) => unknown): ConfirmationButtonLike
  setCancel(): ConfirmationButtonLike
  setInitialFocus(): ConfirmationButtonLike
}

interface ConfirmationModalLike {
  contentEl: HTMLElement
  buttonContainerEl: HTMLElement
  setTitle(title: string): unknown
  addButton(cb: (btn: ConfirmationButtonLike) => void): ConfirmationModalLike
  addCancelButton(text?: string): ConfirmationModalLike
  addCheckbox(label: string, cb: (value: boolean) => unknown): ConfirmationModalLike
  open(): void
  close(): void
  isShown(): boolean
}

const ConfirmationModalCtor = window.obsidian?.['ConfirmationModal'] as unknown as { new (app: unknown): ConfirmationModalLike }

describe('ConfirmationModal', () => {
  it('extends the real Modal (instanceof)', () => {
    const modal = new ConfirmationModalCtor({})
    expect(modal).toBeInstanceOf(window.obsidian?.['Modal'] as unknown as new (...a: unknown[]) => unknown)
  })

  it('addButton() adds a button that auto-closes the modal when the handler returns falsy', async () => {
    const modal = new ConfirmationModalCtor({})
    modal.open()
    modal.addButton((btn) => {
      btn.setButtonText('Bestätigen')
      btn.onClick(() => undefined)
    })
    expect(modal.buttonContainerEl.querySelectorAll('button').length).toBe(1)
    expect(modal.isShown()).toBe(true)

    modal.buttonContainerEl.querySelector('button')!.dispatchEvent(new MouseEvent('click'))
    await Promise.resolve()
    await Promise.resolve()

    expect(modal.isShown()).toBe(false)
  })

  it('addButton() keeps the modal open when the handler returns truthy', async () => {
    const modal = new ConfirmationModalCtor({})
    modal.open()
    modal.addButton((btn) => btn.onClick(() => true))

    modal.buttonContainerEl.querySelector('button')!.dispatchEvent(new MouseEvent('click'))
    await Promise.resolve()
    await Promise.resolve()

    expect(modal.isShown()).toBe(true)
    modal.close()
  })

  it('addCancelButton() adds a button labeled with the given text that closes the modal', async () => {
    const modal = new ConfirmationModalCtor({})
    modal.open()
    modal.addCancelButton('Abbrechen')

    const btn = modal.buttonContainerEl.querySelector('button')!
    expect(btn.textContent).toBe('Abbrechen')
    btn.dispatchEvent(new MouseEvent('click'))
    await Promise.resolve()
    await Promise.resolve()

    expect(modal.isShown()).toBe(false)
  })

  it('addCheckbox() renders a labeled checkbox and calls back on change', () => {
    const modal = new ConfirmationModalCtor({})
    const cb = vi.fn()
    modal.addCheckbox('Nicht mehr anzeigen', cb)

    const input = modal.contentEl.querySelector('input[type=checkbox]') as HTMLInputElement
    expect(modal.contentEl.textContent).toContain('Nicht mehr anzeigen')
    input.checked = true
    input.dispatchEvent(new Event('change'))
    expect(cb).toHaveBeenCalledWith(true)
  })
})
