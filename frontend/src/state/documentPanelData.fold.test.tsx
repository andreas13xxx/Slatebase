import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDocumentPanelData } from './documentPanelData'

afterEach(() => { document.body.innerHTML = '' })

describe('onHeadingFold in reading view', () => {
  it('closes and reopens the heading section that carries the anchor', () => {
    document.body.innerHTML = '<details open><summary><h1 id="eins">Eins</h1></summary><p>Text</p></details>'
    const { result } = renderHook(() => useDocumentPanelData({
      documentContent: '# Eins', documentPath: 'a.md', vaultId: null, apiClient: null, directoryTree: null,
    }))
    const details = document.querySelector('details')!

    result.current.onHeadingFold(0, true, 'eins')
    expect(details.open).toBe(false)
    result.current.onHeadingFold(0, false, 'eins')
    expect(details.open).toBe(true)
  })
})
