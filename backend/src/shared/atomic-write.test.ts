import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { atomicWriteFile } from './atomic-write.js'

describe('atomicWriteFile', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('writes the file with the given content', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'))
    const filePath = path.join(tempDir, 'data.json')

    await atomicWriteFile(filePath, '{"hello":"world"}')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('{"hello":"world"}')
  })

  it('overwrites an existing file', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'))
    const filePath = path.join(tempDir, 'data.json')
    await fs.writeFile(filePath, 'old content', 'utf-8')

    await atomicWriteFile(filePath, 'new content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })

  it('leaves no temp file behind after a successful write', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'))
    const filePath = path.join(tempDir, 'data.json')

    await atomicWriteFile(filePath, 'content')

    const entries = await fs.readdir(tempDir)
    expect(entries).toEqual(['data.json'])
  })

  it('cleans up the temp file and rethrows when rename fails for a non-lock reason', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'))
    // Make the target path itself an existing directory — the temp file
    // writes fine (it's a distinct sibling filename), but renaming a file
    // onto an existing directory fails (EISDIR/EPERM-unrelated), exercising
    // the cleanup-and-rethrow branch rather than the Windows-lock retry path.
    const filePath = path.join(tempDir, 'data.json')
    await fs.mkdir(filePath)

    await expect(atomicWriteFile(filePath, 'content')).rejects.toThrow()

    const entries = await fs.readdir(tempDir)
    expect(entries).toEqual(['data.json'])
    const stat = await fs.stat(filePath)
    expect(stat.isDirectory()).toBe(true)
  })
})
