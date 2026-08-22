/**
 * Behaviour of the `Notice` shim registered by `installObsidianGlobals()`.
 *
 * `noticeEl`/`messageEl`/`containerEl` used to be three detached divs that were
 * never inserted anywhere — only the flattened plain-text message reached the
 * toast. Plugins that build into `messageEl` after construction (progress
 * lines, spinners) or pass a DocumentFragment lost all of it, silently. These
 * tests pin down the real DOM tree and that the element handed to the toast
 * bridge is the same one the plugin holds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'

installObsidianGlobals()

interface NoticeLike {
  noticeEl: HTMLElement & { isShown?: () => boolean }
  messageEl: HTMLElement
  containerEl: HTMLElement
  setMessage(message: string | DocumentFragment): NoticeLike
  hide(): void
  isShown(): boolean
}

const NoticeCtor = window.obsidian?.['Notice'] as unknown as {
  new (message: string | DocumentFragment, timeout?: number): NoticeLike
}

type NoticeWindow = Window & {
  __slatebaseShowNotice?: (msg: string, duration?: number, messageEl?: HTMLElement) => string
  __slatebaseUpdateNotice?: (id: string, msg: string) => void
  __slatebaseDismissNotice?: (id: string) => void
}

const noticeWindow = window as NoticeWindow

describe('Notice', () => {
  beforeEach(() => {
    delete noticeWindow.__slatebaseShowNotice
    delete noticeWindow.__slatebaseUpdateNotice
    delete noticeWindow.__slatebaseDismissNotice
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("builds Obsidian's container > notice > message tree", () => {
    const notice = new NoticeCtor('Hallo')
    expect(notice.noticeEl.parentElement).toBe(notice.containerEl)
    expect(notice.messageEl.parentElement).toBe(notice.noticeEl)
    expect(notice.noticeEl.classList.contains('notice')).toBe(true)
    expect(notice.containerEl.classList.contains('notice-container')).toBe(true)
  })

  it('puts a string message into messageEl', () => {
    expect(new NoticeCtor('Hallo').messageEl.textContent).toBe('Hallo')
  })

  it('appends a DocumentFragment instead of flattening it to text', () => {
    const frag = document.createDocumentFragment()
    const strong = document.createElement('strong')
    strong.textContent = 'Wichtig'
    frag.appendChild(strong)

    const notice = new NoticeCtor(frag)
    // Flattening to textContent threw the markup away — plugins pass a fragment
    // precisely when the notice has markup in it.
    expect(notice.messageEl.querySelector('strong')?.textContent).toBe('Wichtig')
  })

  it('hands the live noticeEl to the toast bridge, not a copy', () => {
    const show = vi.fn(() => 'toast-1')
    noticeWindow.__slatebaseShowNotice = show

    const notice = new NoticeCtor('Hallo', 3000)
    expect(show).toHaveBeenCalledTimes(1)
    const [msg, duration, el] = show.mock.calls[0] as unknown as [string, number, HTMLElement]
    expect(msg).toBe('Hallo')
    expect(duration).toBe(3000)
    // The plugin mutates the element it holds; the toast must be showing that
    // same node or the mutation is invisible.
    expect(el).toBe(notice.noticeEl)
  })

  it('reflects post-construction edits to messageEl in the mounted element', () => {
    noticeWindow.__slatebaseShowNotice = vi.fn(() => 'toast-1')
    const notice = new NoticeCtor('Schritt 1')
    notice.messageEl.textContent = 'Schritt 2'
    // Same tree, so what the toast mounted now reads the new text.
    expect(notice.noticeEl.textContent).toBe('Schritt 2')
  })

  it('setMessage() replaces the content rather than appending to it', () => {
    const notice = new NoticeCtor('Alt')
    notice.setMessage('Neu')
    expect(notice.messageEl.textContent).toBe('Neu')
  })

  it('setMessage() keeps the toast plain-text mirror in sync', () => {
    noticeWindow.__slatebaseShowNotice = vi.fn(() => 'toast-1')
    const update = vi.fn()
    noticeWindow.__slatebaseUpdateNotice = update

    new NoticeCtor('Alt').setMessage('Neu')
    expect(update).toHaveBeenCalledWith('toast-1', 'Neu')
  })

  it('hide() dismisses the toast and flips isShown()', () => {
    noticeWindow.__slatebaseShowNotice = vi.fn(() => 'toast-1')
    const dismiss = vi.fn()
    noticeWindow.__slatebaseDismissNotice = dismiss

    const notice = new NoticeCtor('Hallo')
    expect(notice.isShown()).toBe(true)
    expect(notice.noticeEl.isShown?.()).toBe(true)

    notice.hide()
    expect(dismiss).toHaveBeenCalledWith('toast-1')
    expect(notice.isShown()).toBe(false)
    expect(notice.noticeEl.isShown?.()).toBe(false)
  })

  it('still builds its DOM when the toast bridge is not wired up yet', () => {
    // Plugins can construct a Notice during onload(), before PluginProvider has
    // installed the bridge; that must not throw or leave the tree half-built.
    const notice = new NoticeCtor('Früh')
    expect(notice.messageEl.parentElement).toBe(notice.noticeEl)
    expect(() => { notice.hide() }).not.toThrow()
  })
})
