import { describe, it, expect } from 'vitest'
import { computeRelativePath, isImageFile, getValidDropTargets, clampMenuPosition } from './pathUtils'
import type { DirectoryTree } from '../types'

describe('computeRelativePath', () => {
  it('computes path between files in the same directory', () => {
    expect(computeRelativePath('docs/a.md', 'docs/b.md')).toBe('./b.md')
  })

  it('computes path from a deeper file to a shallower file', () => {
    expect(computeRelativePath('docs/sub/a.md', 'docs/b.md')).toBe('../b.md')
  })

  it('computes path from a shallower file to a deeper file', () => {
    expect(computeRelativePath('docs/a.md', 'docs/sub/b.md')).toBe('./sub/b.md')
  })

  it('computes path across different branches', () => {
    expect(computeRelativePath('src/components/App.tsx', 'assets/images/logo.png'))
      .toBe('../../assets/images/logo.png')
  })

  it('computes path from root-level file to nested file', () => {
    expect(computeRelativePath('README.md', 'docs/guide/intro.md'))
      .toBe('./docs/guide/intro.md')
  })

  it('computes path from nested file to root-level file', () => {
    expect(computeRelativePath('docs/guide/intro.md', 'README.md'))
      .toBe('../../README.md')
  })
})

describe('isImageFile', () => {
  it('returns true for recognized image extensions', () => {
    expect(isImageFile('photo.png')).toBe(true)
    expect(isImageFile('photo.jpg')).toBe(true)
    expect(isImageFile('photo.jpeg')).toBe(true)
    expect(isImageFile('photo.gif')).toBe(true)
    expect(isImageFile('icon.svg')).toBe(true)
    expect(isImageFile('banner.webp')).toBe(true)
    expect(isImageFile('hero.avif')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isImageFile('photo.PNG')).toBe(true)
    expect(isImageFile('photo.Jpg')).toBe(true)
    expect(isImageFile('icon.SVG')).toBe(true)
  })

  it('returns false for non-image extensions', () => {
    expect(isImageFile('document.md')).toBe(false)
    expect(isImageFile('data.json')).toBe(false)
    expect(isImageFile('style.css')).toBe(false)
    expect(isImageFile('report.pdf')).toBe(false)
    expect(isImageFile('archive.zip')).toBe(false)
  })

  it('returns false for files without extension', () => {
    expect(isImageFile('Makefile')).toBe(false)
    expect(isImageFile('README')).toBe(false)
  })

  it('returns false for files ending with a dot', () => {
    expect(isImageFile('file.')).toBe(false)
  })
})

describe('getValidDropTargets', () => {
  const tree: DirectoryTree = {
    name: 'root',
    type: 'directory',
    path: '',
    children: [
      {
        name: 'docs',
        type: 'directory',
        path: 'docs',
        children: [
          { name: 'guide', type: 'directory', path: 'docs/guide', children: [] },
          { name: 'intro.md', type: 'file', path: 'docs/intro.md' },
        ],
      },
      {
        name: 'src',
        type: 'directory',
        path: 'src',
        children: [
          { name: 'index.ts', type: 'file', path: 'src/index.ts' },
        ],
      },
      { name: 'README.md', type: 'file', path: 'README.md' },
    ],
  }

  it('excludes the dragged node itself', () => {
    const targets = getValidDropTargets(tree, 'docs')
    expect(targets.has('docs')).toBe(false)
  })

  it('excludes descendants of the dragged node', () => {
    const targets = getValidDropTargets(tree, 'docs')
    expect(targets.has('docs/guide')).toBe(false)
  })

  it('includes other directories as valid targets', () => {
    const targets = getValidDropTargets(tree, 'docs')
    expect(targets.has('')).toBe(true)
    expect(targets.has('src')).toBe(true)
  })

  it('does not include files as drop targets', () => {
    const targets = getValidDropTargets(tree, 'src/index.ts')
    expect(targets.has('README.md')).toBe(false)
    expect(targets.has('docs/intro.md')).toBe(false)
  })

  it('returns all directories except self when dragging a file', () => {
    const targets = getValidDropTargets(tree, 'README.md')
    expect(targets.has('')).toBe(true)
    expect(targets.has('docs')).toBe(true)
    expect(targets.has('docs/guide')).toBe(true)
    expect(targets.has('src')).toBe(true)
  })
})

describe('clampMenuPosition', () => {
  it('returns the original position when menu fits', () => {
    const result = clampMenuPosition(100, 100, 150, 200, 1024, 768)
    expect(result).toEqual({ x: 100, y: 100 })
  })

  it('clamps X when menu would overflow right edge', () => {
    const result = clampMenuPosition(900, 100, 150, 200, 1024, 768)
    // maxX = 1024 - 8 - 150 = 866
    expect(result.x).toBe(866)
    expect(result.y).toBe(100)
  })

  it('clamps Y when menu would overflow bottom edge', () => {
    const result = clampMenuPosition(100, 600, 150, 200, 1024, 768)
    // maxY = 768 - 8 - 200 = 560
    expect(result.x).toBe(100)
    expect(result.y).toBe(560)
  })

  it('clamps X to minimum margin when too far left', () => {
    const result = clampMenuPosition(2, 100, 150, 200, 1024, 768)
    expect(result.x).toBe(8)
    expect(result.y).toBe(100)
  })

  it('clamps Y to minimum margin when too far up', () => {
    const result = clampMenuPosition(100, 3, 150, 200, 1024, 768)
    expect(result.x).toBe(100)
    expect(result.y).toBe(8)
  })

  it('ensures 8px margin on all sides', () => {
    const result = clampMenuPosition(0, 0, 100, 100, 200, 200)
    expect(result.x).toBeGreaterThanOrEqual(8)
    expect(result.y).toBeGreaterThanOrEqual(8)
    expect(result.x + 100).toBeLessThanOrEqual(200 - 8)
    expect(result.y + 100).toBeLessThanOrEqual(200 - 8)
  })
})
