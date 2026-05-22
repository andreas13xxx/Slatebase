import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { FileViewer } from './FileViewer'
import { AppContext } from '../state'
import { initialState } from '../state'
import type { AppState, AppAction } from '../types'
import type { Dispatch } from 'react'

/** Helper to render FileViewer with a custom state. */
function renderFileViewer(stateOverrides: Partial<AppState> = {}) {
  const dispatch = vi.fn() as Dispatch<AppAction> & ReturnType<typeof vi.fn>
  const state: AppState = { ...initialState, ...stateOverrides }

  const result = render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch, apiClient: null } },
      React.createElement(FileViewer),
    ),
  )

  return { dispatch, ...result }
}

describe('FileViewer', () => {
  it('renders nothing when no file is selected and no error', () => {
    const { container } = renderFileViewer()

    expect(container.innerHTML).toBe('')
  })

  it('displays the file name as a heading (Req 4.2)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'notes/hello.md',
        name: 'hello.md',
        content: '# Hello World',
        size: 13,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      },
    })

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('hello.md')
  })

  it('renders file content in a <pre> element with monospace font (Req 4.1, 4.3)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'test.txt',
        name: 'test.txt',
        content: 'Line 1\n  Line 2\n\tTabbed',
        size: 25,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      },
    })

    const pre = document.querySelector('pre.file-viewer-content')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('Line 1\n  Line 2\n\tTabbed')
    expect(pre).toHaveStyle({ fontFamily: 'monospace' })
  })

  it('preserves UTF-8 special characters and umlauts (Req 4.5)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'umlaute.md',
        name: 'umlaute.md',
        content: 'Ä Ö Ü ß äöü — €',
        size: 20,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      },
    })

    expect(screen.getByText('Ä Ö Ü ß äöü — €')).toBeInTheDocument()
  })

  it('shows truncation notice when isTruncated is true (Req 4.7)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'large.md',
        name: 'large.md',
        content: 'partial content...',
        size: 6000000,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: true,
      },
    })

    expect(
      screen.getByText('Datei wurde abgeschnitten (nur die ersten 5 MB werden angezeigt)'),
    ).toBeInTheDocument()
  })

  it('shows binary file notice when isBinary is true (Req 4.6)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'image.png',
        name: 'image.png',
        content: '',
        size: 1024,
        encoding: 'utf-8',
        isBinary: true,
        isTruncated: false,
      },
    })

    expect(
      screen.getByText(
        'Diese Datei ist eine Binärdatei und kann nicht als Klartext dargestellt werden',
      ),
    ).toBeInTheDocument()
  })

  it('does not render <pre> content for binary files', () => {
    renderFileViewer({
      selectedFile: {
        path: 'image.png',
        name: 'image.png',
        content: '',
        size: 1024,
        encoding: 'utf-8',
        isBinary: true,
        isTruncated: false,
      },
    })

    expect(screen.queryByRole('code')).not.toBeInTheDocument()
    const pre = document.querySelector('pre')
    expect(pre).not.toBeInTheDocument()
  })

  it('shows error message with code and reason when file load fails (Req 4.4)', () => {
    renderFileViewer({
      selectedFile: null,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'Die Datei "notes.md" wurde nicht gefunden',
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('FILE_NOT_FOUND')
    expect(alert).toHaveTextContent('Die Datei "notes.md" wurde nicht gefunden')
  })

  it('does not show error when a file is selected (error is stale)', () => {
    renderFileViewer({
      selectedFile: {
        path: 'test.md',
        name: 'test.md',
        content: 'content',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      },
      error: {
        code: 'SOME_ERROR',
        message: 'stale error',
      },
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('test.md')
  })

  it('does not show truncation notice for binary files', () => {
    renderFileViewer({
      selectedFile: {
        path: 'big-binary.bin',
        name: 'big-binary.bin',
        content: '',
        size: 6000000,
        encoding: 'utf-8',
        isBinary: true,
        isTruncated: true,
      },
    })

    expect(
      screen.queryByText('Datei wurde abgeschnitten (nur die ersten 5 MB werden angezeigt)'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Diese Datei ist eine Binärdatei und kann nicht als Klartext dargestellt werden',
      ),
    ).toBeInTheDocument()
  })

  it('uses accessible section landmark with aria-label', () => {
    renderFileViewer({
      selectedFile: {
        path: 'readme.md',
        name: 'readme.md',
        content: '# README',
        size: 8,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      },
    })

    const section = screen.getByRole('region', { name: 'Dateiansicht' })
    expect(section).toBeInTheDocument()
  })
})
