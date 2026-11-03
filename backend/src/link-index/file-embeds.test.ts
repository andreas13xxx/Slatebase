// file.embeds: `![[x]]` targets are tracked separately from plain links, survive
// a persist/load round trip, and an index written before embeds existed is rebuilt.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexService } from './link-index-service.js'
import { extractWikilinks } from './wikilink-parser.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => createMockLogger() } as unknown as ILogger
}

describe('wikilink parser: embed flag', () => {
  it('marks only ![[...]] as an embed and leaves plain links untouched', () => {
    const [plain, embed] = extractWikilinks('see [[A]] and ![[B]]')
    expect(plain).toEqual({ target: 'A', display: 'A', heading: null, blockRef: null, position: { line: 1, column: 5 } })
    expect(embed?.embed).toBe(true)
    expect(embed?.target).toBe('B')
  })

  it('does not flag a link at column 1', () => {
    expect(extractWikilinks('[[A]]')[0]?.embed).toBeUndefined()
  })
})

describe('LinkIndexService file.embeds', () => {
  let tempDir: string
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-embeds-'))
    await fs.writeFile(path.join(tempDir, 'host.md'), '---\ntype: x\n---\n[[Linked]] ![[Image.png]] ![[Embedded]]')
    await fs.writeFile(path.join(tempDir, 'plain.md'), '---\ntype: x\n---\n[[Linked]]')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function embedsOf(service: LinkIndexService, p: string): Promise<string[] | undefined> {
    const res = await service.queryForBase({ columns: ['type'] })
    return res.rows.find((r) => r.path === p)?.embeds?.slice().sort()
  }

  it('reports embeds apart from links', async () => {
    const service = new LinkIndexService(tempDir, 'v', 'V', logger)
    await service.rebuild()
    expect(await embedsOf(service, 'host.md')).toEqual(['Embedded.md', 'Image.png'])
    expect(await embedsOf(service, 'plain.md')).toBeUndefined()
  })

  it('updates on a content change', async () => {
    const service = new LinkIndexService(tempDir, 'v', 'V', logger)
    await service.rebuild()
    await service.updateFile('host.md', '[[Linked]]')
    expect(await embedsOf(service, 'host.md')).toBeUndefined()
    await service.updateFile('host.md', '![[Only]]')
    expect(await embedsOf(service, 'host.md')).toEqual(['Only.md'])
  })

  it('survives persist and load', async () => {
    const service = new LinkIndexService(tempDir, 'v', 'V', logger)
    await service.rebuild()
    const reloaded = new LinkIndexService(tempDir, 'v', 'V', logger)
    await reloaded.loadFromDisk()
    expect(await embedsOf(reloaded, 'host.md')).toEqual(['Embedded.md', 'Image.png'])
  })

  it('rebuilds an index that was persisted before embeds existed', async () => {
    const service = new LinkIndexService(tempDir, 'v', 'V', logger)
    await service.rebuild()
    const file = path.join(tempDir, '.slatebase', 'link-index.json')
    const old = JSON.parse(await fs.readFile(file, 'utf-8'))
    delete old.embeds
    await fs.writeFile(file, JSON.stringify(old))

    const reloaded = new LinkIndexService(tempDir, 'v', 'V', logger)
    await reloaded.loadFromDisk()
    expect(await embedsOf(reloaded, 'host.md')).toEqual(['Embedded.md', 'Image.png'])
  })
})
