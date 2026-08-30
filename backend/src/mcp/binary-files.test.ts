// MCP binary file support — read_file / write_file / resources/read
//
// Binary files used to be rejected outright (error -32003). They are now
// served base64-encoded: images and audio as the dedicated MCP image/audio
// content blocks, everything else as an embedded resource blob — and
// write_file accepts base64 input so binary files can be created too.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerToolHandlers } from './tool-handlers.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import { McpHandlers } from './handlers.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import { PathTraversalError } from '../vault/index.js'
import type { IVaultReader } from '../vault/index.js'
import type { ILogger } from '../logger/index.js'
import type { McpConfig } from './config.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02])
const PDF_BYTES = Buffer.from('%PDF-1.4\n\x00binary-ish', 'latin1')
const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00, 0xff, 0xfb])

let vaultDir: string

beforeEach(async () => {
  vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-mcp-binary-'))
})

afterEach(async () => {
  await fs.rm(vaultDir, { recursive: true, force: true })
})

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger
}

/** Minimal fake McpServer.tool() that records each handler under its tool name. */
function createMockServer() {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>()
  return {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string
      const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<CallToolResult>
      handlers.set(name, handler)
    }),
    handlers,
  }
}

function createVaultService(overrides: Partial<IVaultService> = {}): IVaultService {
  return {
    resolveFilePath: vi.fn((_vaultId: string, filePath: string) => path.join(vaultDir, filePath)),
    saveFile: vi.fn().mockResolvedValue({ path: 'x', name: 'x', size: 0, etag: 'etag-1' }),
    ...overrides,
  } as unknown as IVaultService
}

function buildDeps(vaultService: IVaultService, maxFileSize = 5 * 1024 * 1024): ToolHandlerDeps {
  return {
    vaultService,
    vaultAccessControl: {
      checkReadAccess: vi.fn().mockResolvedValue(undefined),
      checkWriteAccess: vi.fn().mockResolvedValue(undefined),
    } as unknown as IVaultAccessControl,
    logger: createMockLogger(),
    mcpConfig: { maxFileSize } as McpConfig,
    getUserId: () => 'user-1',
  }
}

/** Registers the tool handlers and returns the callback for one tool. */
function toolHandler(name: string, vaultService: IVaultService, maxFileSize?: number) {
  const server = createMockServer()
  registerToolHandlers(server as never, buildDeps(vaultService, maxFileSize))
  return server.handlers.get(name)!
}

async function readFileTool(args: Record<string, unknown>, maxFileSize?: number): Promise<CallToolResult> {
  return await toolHandler('read_file', createVaultService(), maxFileSize)(args)
}

function parseError(result: CallToolResult): { code: number; message: string } {
  const text = (result.content[0] as { type: 'text'; text: string }).text
  return JSON.parse(text) as { code: number; message: string }
}

function savedContent(vaultService: IVaultService): unknown {
  return (vaultService.saveFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![2]
}

describe('read_file — binary files', () => {
  it('returns an image content block for a PNG', async () => {
    await fs.writeFile(path.join(vaultDir, 'shot.png'), PNG_BYTES)

    const result = await readFileTool({ vaultId: 'v1', path: 'shot.png' })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]).toEqual({
      type: 'image',
      data: PNG_BYTES.toString('base64'),
      mimeType: 'image/png',
    })
  })

  it('returns an audio content block for an MP3', async () => {
    await fs.writeFile(path.join(vaultDir, 'memo.mp3'), MP3_BYTES)

    const result = await readFileTool({ vaultId: 'v1', path: 'memo.mp3' })

    expect(result.content[0]).toEqual({
      type: 'audio',
      data: MP3_BYTES.toString('base64'),
      mimeType: 'audio/mpeg',
    })
  })

  it('returns an embedded resource blob for a PDF', async () => {
    await fs.writeFile(path.join(vaultDir, 'paper.pdf'), PDF_BYTES)

    const result = await readFileTool({ vaultId: 'v1', path: 'paper.pdf' })

    expect(result.content[0]).toEqual({
      type: 'resource',
      resource: {
        uri: 'vault://v1/paper.pdf',
        blob: PDF_BYTES.toString('base64'),
        mimeType: 'application/pdf',
      },
    })
  })

  it('falls back to application/octet-stream for unknown binary extensions', async () => {
    await fs.writeFile(path.join(vaultDir, 'data.bin'), Buffer.from([0x00, 0x01, 0xff]))

    const result = await readFileTool({ vaultId: 'v1', path: 'data.bin' })

    const content = result.content[0] as { type: string; resource: { mimeType: string } }
    expect(content.type).toBe('resource')
    expect(content.resource.mimeType).toBe('application/octet-stream')
  })

  it('percent-encodes path segments in the resource URI', async () => {
    await fs.mkdir(path.join(vaultDir, 'Mein Ordner'), { recursive: true })
    await fs.writeFile(path.join(vaultDir, 'Mein Ordner', 'Übung.bin'), Buffer.from([0x00, 0x42]))

    const result = await readFileTool({ vaultId: 'v1', path: 'Mein Ordner/Übung.bin' })

    const content = result.content[0] as { resource: { uri: string } }
    expect(content.resource.uri).toBe('vault://v1/Mein%20Ordner/%C3%9Cbung.bin')
  })

  it('still returns plain text for text files', async () => {
    await fs.writeFile(path.join(vaultDir, 'Note.md'), '# Titel\n\nInhalt', 'utf-8')

    const result = await readFileTool({ vaultId: 'v1', path: 'Note.md' })

    expect(result.content[0]).toEqual({ type: 'text', text: '# Titel\n\nInhalt' })
  })

  it('returns a blob for a text file when base64 encoding is requested explicitly', async () => {
    await fs.writeFile(path.join(vaultDir, 'Note.md'), 'Hallo', 'utf-8')

    const result = await readFileTool({ vaultId: 'v1', path: 'Note.md', encoding: 'base64' })

    expect(result.content[0]).toEqual({
      type: 'resource',
      resource: {
        uri: 'vault://v1/Note.md',
        blob: Buffer.from('Hallo', 'utf-8').toString('base64'),
        mimeType: 'text/markdown',
      },
    })
  })

  it('rejects a binary file above maxFileSize with -32004 instead of reading it', async () => {
    await fs.writeFile(path.join(vaultDir, 'big.png'), Buffer.alloc(2048))

    const result = await readFileTool({ vaultId: 'v1', path: 'big.png' }, 1024)

    expect(result.isError).toBe(true)
    expect(parseError(result).code).toBe(-32004)
  })

  it('reports a path traversal attempt as invalid params (-32602), not as the retired binary code', async () => {
    const vaultService = createVaultService({
      resolveFilePath: vi.fn(() => {
        throw new PathTraversalError('../etc/passwd')
      }),
    })

    const result = await toolHandler('read_file', vaultService)({ vaultId: 'v1', path: '../etc/passwd' })

    expect(result.isError).toBe(true)
    expect(parseError(result).code).toBe(-32602)
  })
})

describe('write_file — base64 encoding', () => {
  it('decodes base64 content into raw bytes before saving', async () => {
    const vaultService = createVaultService()

    await toolHandler('write_file', vaultService)({
      vaultId: 'v1',
      path: 'Bilder/logo.png',
      content: PNG_BYTES.toString('base64'),
      encoding: 'base64',
    })

    const saved = savedContent(vaultService) as Buffer
    expect(Buffer.isBuffer(saved)).toBe(true)
    expect(saved.equals(PNG_BYTES)).toBe(true)
  })

  it('tolerates line-wrapped base64', async () => {
    const vaultService = createVaultService()
    const wrapped = PNG_BYTES.toString('base64').replace(/(.{4})/, '$1\n')

    await toolHandler('write_file', vaultService)({
      vaultId: 'v1',
      path: 'logo.png',
      content: wrapped,
      encoding: 'base64',
    })

    expect((savedContent(vaultService) as Buffer).equals(PNG_BYTES)).toBe(true)
  })

  it('rejects malformed base64 with -32602 without writing anything', async () => {
    const vaultService = createVaultService()

    const result = await toolHandler('write_file', vaultService)({
      vaultId: 'v1',
      path: 'logo.png',
      content: 'not-valid-base64!!',
      encoding: 'base64',
    })

    expect(result.isError).toBe(true)
    expect(parseError(result).code).toBe(-32602)
    expect(vaultService.saveFile).not.toHaveBeenCalled()
  })

  it('rejects truncated base64 that Buffer.from would silently accept', async () => {
    const vaultService = createVaultService()

    const result = await toolHandler('write_file', vaultService)({
      vaultId: 'v1',
      path: 'logo.png',
      content: PNG_BYTES.toString('base64').slice(0, -1),
      encoding: 'base64',
    })

    expect(result.isError).toBe(true)
    expect(vaultService.saveFile).not.toHaveBeenCalled()
  })

  it('passes the MCP size limit to saveFile so large binaries can be written back', async () => {
    const vaultService = createVaultService()

    await toolHandler('write_file', vaultService, 16777216)({
      vaultId: 'v1',
      path: 'scan.pdf',
      content: PDF_BYTES.toString('base64'),
      encoding: 'base64',
    })

    expect((vaultService.saveFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![4]).toBe(16777216)
  })

  it('passes text through unchanged when encoding is omitted', async () => {
    const vaultService = createVaultService()

    await toolHandler('write_file', vaultService)({
      vaultId: 'v1',
      path: 'Note.md',
      content: '# Hallo',
    })

    expect(savedContent(vaultService)).toBe('# Hallo')
  })
})

describe('resources/read — binary files', () => {
  type ResourceReadCallback = (
    uri: URL,
    variables: Record<string, string | string[]>,
    extra: unknown,
  ) => Promise<{ contents: Array<Record<string, unknown>> }>

  /** Registers McpHandlers on a fake server and returns a read helper. */
  function createResourceReader(): (filePath: string) => ReturnType<ResourceReadCallback> {
    let readCallback!: ResourceReadCallback

    const handlers = new McpHandlers({
      vaultService: createVaultService(),
      vaultAccessControl: { checkReadAccess: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultAccessControl,
      vaultReader: {} as IVaultReader,
      logger: createMockLogger(),
      mcpConfig: { maxFileSize: 5 * 1024 * 1024 } as McpConfig,
    })

    handlers.register({
      resource: (...args: unknown[]) => {
        readCallback = args[args.length - 1] as ResourceReadCallback
      },
    } as never)

    return (filePath: string) => readCallback(
      new URL(`vault://v1/${filePath}`),
      { vaultId: 'v1', path: filePath },
      { authInfo: { extra: { userId: 'user-1' } } },
    )
  }

  it('serves a binary file as a base64 blob with its media type', async () => {
    await fs.writeFile(path.join(vaultDir, 'shot.png'), PNG_BYTES)

    const result = await createResourceReader()('shot.png')

    expect(result.contents[0]).toEqual({
      uri: 'vault://v1/shot.png',
      blob: PNG_BYTES.toString('base64'),
      mimeType: 'image/png',
    })
  })

  it('still serves text files as text', async () => {
    await fs.writeFile(path.join(vaultDir, 'Note.md'), 'Inhalt', 'utf-8')

    const result = await createResourceReader()('Note.md')

    expect(result.contents[0]).toEqual({
      uri: 'vault://v1/Note.md',
      text: 'Inhalt',
      mimeType: 'text/markdown',
    })
  })
})

describe('binary round trip through the real MCP SDK', () => {
  /** Connects a real McpServer/Client pair so the SDK validates our result shapes. */
  async function connectClient(vaultService: IVaultService): Promise<Client> {
    const server = new McpServer({ name: 'slatebase-test', version: '1.0.0' })
    registerToolHandlers(server, buildDeps(vaultService))

    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    return client
  }

  it('writes a PNG as base64 and reads back the identical bytes', async () => {
    const vaultService = createVaultService({
      saveFile: vi.fn(async (_vaultId: string, filePath: string, content: string | Buffer) => {
        await fs.writeFile(path.join(vaultDir, filePath), content as Buffer)
        return { path: filePath, name: filePath, size: 0, etag: 'etag-1' }
      }) as unknown as IVaultService['saveFile'],
    })
    const client = await connectClient(vaultService)

    await client.callTool({
      name: 'write_file',
      arguments: { vaultId: 'v1', path: 'logo.png', content: PNG_BYTES.toString('base64'), encoding: 'base64' },
    })

    expect((await fs.readFile(path.join(vaultDir, 'logo.png'))).equals(PNG_BYTES)).toBe(true)

    const result = await client.callTool({ name: 'read_file', arguments: { vaultId: 'v1', path: 'logo.png' } })
    expect((result.content as Array<{ type: string; data: string }>)[0]).toEqual({
      type: 'image',
      data: PNG_BYTES.toString('base64'),
      mimeType: 'image/png',
    })
  })

  it('advertises the encoding parameters as optional in the tool schemas', async () => {
    const client = await connectClient(createVaultService())

    const { tools } = await client.listTools()
    const readSchema = tools.find((tool) => tool.name === 'read_file')!.inputSchema
    const writeSchema = tools.find((tool) => tool.name === 'write_file')!.inputSchema

    expect((readSchema.properties as Record<string, { enum: string[] }>)['encoding']!.enum).toEqual(['auto', 'base64'])
    expect((writeSchema.properties as Record<string, { enum: string[] }>)['encoding']!.enum).toEqual(['utf-8', 'base64'])
    expect(readSchema.required).not.toContain('encoding')
    expect(writeSchema.required).not.toContain('encoding')
  })
})
