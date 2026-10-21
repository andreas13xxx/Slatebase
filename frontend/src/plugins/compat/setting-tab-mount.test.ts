import { afterEach, describe, expect, it } from 'vitest'
import { mountSettingTab, waitForElement } from './setting-tab-mount'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('mountSettingTab', () => {
  it('attaches the container to the document before render() runs', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const tab = { containerEl: document.createElement('div') }
    let attachedDuringRender: boolean | null = null

    mountSettingTab(host, tab, () => { attachedDuringRender = tab.containerEl.isConnected })

    expect(attachedDuringRender).toBe(true)
    expect(tab.containerEl.parentNode).toBe(host)
  })

  it('lets a tab that renders only when attached (Style Settings) draw its content', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const tab = { containerEl: document.createElement('div') }

    mountSettingTab(host, tab, () => {
      if (tab.containerEl.parentNode) tab.containerEl.appendChild(document.createElement('section'))
    })

    expect(tab.containerEl.children).toHaveLength(1)
  })

  it('clears what the host and the container held from an earlier open', () => {
    const host = document.createElement('div')
    host.innerHTML = '<p>old</p>'
    document.body.appendChild(host)
    const tab = { containerEl: document.createElement('div') }
    tab.containerEl.innerHTML = '<b>stale</b>'

    mountSettingTab(host, tab, () => undefined)

    expect(host.children).toHaveLength(1)
    expect(host.firstElementChild).toBe(tab.containerEl)
    expect(tab.containerEl.innerHTML).toBe('')
  })
})

describe('waitForElement', () => {
  it('resolves once the element appears', async () => {
    let element: HTMLElement | null = null
    setTimeout(() => { element = document.createElement('div') }, 20)
    expect(await waitForElement(() => element)).toBeInstanceOf(HTMLElement)
  })

  it('gives up with null after the frame limit', async () => {
    expect(await waitForElement(() => null, 2)).toBeNull()
  })
})
