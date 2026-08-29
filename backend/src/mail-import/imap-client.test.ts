import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImapClient } from './imap-client.js'
import { ImapConnectionError } from './errors.js'

const connectMock = vi.fn()
const getMailboxLockMock = vi.fn()
const fetchMock = vi.fn()
const fetchOneMock = vi.fn()
const messageFlagsAddMock = vi.fn()
const listTreeMock = vi.fn()
const logoutMock = vi.fn()

vi.mock('imapflow', () => ({
  // A regular `function` (not an arrow function) so `mockImplementation` can
  // be invoked with `new` — arrow functions have no [[Construct]] and throw
  // "is not a constructor" when the code under test does `new ImapFlow(...)`.
  ImapFlow: vi.fn().mockImplementation(function ImapFlowMock() {
    return {
      connect: connectMock,
      getMailboxLock: getMailboxLockMock,
      fetch: fetchMock,
      fetchOne: fetchOneMock,
      messageFlagsAdd: messageFlagsAddMock,
      listTree: listTreeMock,
      logout: logoutMock,
    }
  }),
}))

const CONFIG = { host: 'imap.example.invalid', port: 993, secure: true, username: 'user', password: 'pw', mailbox: 'INBOX' }
const ACCOUNT = { host: 'imap.example.invalid', port: 993, secure: true, username: 'user', password: 'pw' }

/** Builds the async iterable `client.fetch(...)` normally returns. */
function asyncFetchResult(messages: Array<{ uid: number; flags: string[] }>) {
  return (async function* () {
    for (const m of messages) yield { uid: m.uid, flags: new Set(m.flags) }
  })()
}

describe('ImapClient', () => {
  beforeEach(() => {
    connectMock.mockReset().mockResolvedValue(undefined)
    getMailboxLockMock.mockReset().mockResolvedValue({ release: vi.fn() })
    fetchMock.mockReset().mockReturnValue(asyncFetchResult([]))
    fetchOneMock.mockReset().mockResolvedValue({ source: Buffer.from('raw') })
    messageFlagsAddMock.mockReset().mockResolvedValue(true)
    listTreeMock.mockReset().mockResolvedValue({ root: true, folders: [] })
    logoutMock.mockReset().mockResolvedValue(undefined)
  })

  it('surfaces the IMAP server responseText instead of the generic "Command failed"', async () => {
    // This is exactly how imapflow reports a rejected LOGIN: a generic
    // Error('Command failed') with the server's real reason attached as
    // `responseText` rather than in `.message`.
    const imapError = Object.assign(new Error('Command failed'), { responseText: 'Login failed.' })
    connectMock.mockRejectedValue(imapError)

    const client = new ImapClient()
    await expect(client.connect(CONFIG)).rejects.toThrow(ImapConnectionError)
    await expect(client.connect(CONFIG)).rejects.toThrow(/Login failed\./)
  })

  it('falls back to the plain error message when there is no responseText', async () => {
    connectMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const client = new ImapClient()
    await expect(client.connect(CONFIG)).rejects.toThrow(/ECONNREFUSED/)
  })

  it('surfaces a clear error and logs out when the mailbox cannot be opened', async () => {
    const imapError = Object.assign(new Error('Command failed'), { responseText: "Mailbox doesn't exist." })
    getMailboxLockMock.mockRejectedValue(imapError)

    const client = new ImapClient()
    await expect(client.connect(CONFIG)).rejects.toThrow(/Mailbox doesn't exist\./)
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it('lists messages without \\Seen in their flags, sorted ascending by UID', async () => {
    fetchMock.mockReturnValue(asyncFetchResult([
      { uid: 12, flags: [] },
      { uid: 5, flags: ['\\Seen'] },
      { uid: 8, flags: ['$ITipAnalyzed'] }, // a non-standard flag present, but no \Seen — still unseen
    ]))

    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    const uids = await connection.listUnseenUids()

    expect(fetchMock).toHaveBeenCalledWith('1:*', { uid: true, flags: true }, { uid: true })
    expect(uids).toEqual([8, 12])
  })

  it('does not rely on SEARCH UNSEEN — some servers report it incorrectly despite STATUS/FETCH agreeing a message is unseen', async () => {
    // Regression test for a real account where `SEARCH UNSEEN` returned an
    // empty result even though STATUS reported UNSEEN=2 and a direct FETCH
    // showed neither message carried \Seen. Flags-based filtering must find
    // them regardless of what a (possibly buggy) SEARCH would say.
    fetchMock.mockReturnValue(asyncFetchResult([
      { uid: 8, flags: ['$ITipAnalyzed'] },
      { uid: 9, flags: [] },
    ]))

    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    expect(await connection.listUnseenUids()).toEqual([8, 9])
  })

  it('returns an empty list for a mailbox with no messages', async () => {
    fetchMock.mockReturnValue(asyncFetchResult([]))

    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    expect(await connection.listUnseenUids()).toEqual([])
  })

  it('fetches a single message by UID', async () => {
    fetchOneMock.mockResolvedValue({ source: Buffer.from('hello') })

    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    const source = await connection.fetchMessage(42)

    expect(fetchOneMock).toHaveBeenCalledWith(42, { source: true }, { uid: true })
    expect(source.toString()).toBe('hello')
  })

  it('marks a message as read via the \\Seen flag', async () => {
    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    await connection.markAsRead(42)

    expect(messageFlagsAddMock).toHaveBeenCalledWith([42], ['\\Seen'], { uid: true })
  })

  it('releases the mailbox lock and logs out on close', async () => {
    const release = vi.fn()
    getMailboxLockMock.mockResolvedValue({ release })

    const client = new ImapClient()
    const connection = await client.connect(CONFIG)
    await connection.close()

    expect(release).toHaveBeenCalledTimes(1)
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  describe('listMailboxTree', () => {
    it('converts imapflow\'s nested tree into MailboxTreeNode[], dropping the synthetic root', async () => {
      listTreeMock.mockResolvedValue({
        root: true,
        folders: [
          {
            path: 'INBOX', name: 'INBOX', disabled: false,
            folders: [
              { path: 'INBOX.000', name: '000', disabled: false, folders: [] },
            ],
          },
          { path: 'Sent', name: 'Sent', disabled: false, folders: [] },
        ],
      })

      const client = new ImapClient()
      const tree = await client.listMailboxTree(ACCOUNT)

      expect(tree).toEqual([
        { path: 'INBOX', name: 'INBOX', selectable: true, children: [
          { path: 'INBOX.000', name: '000', selectable: true, children: [] },
        ] },
        { path: 'Sent', name: 'Sent', selectable: true, children: [] },
      ])
      expect(logoutMock).toHaveBeenCalledTimes(1)
    })

    it('marks a folder non-selectable when the server reports it disabled', async () => {
      listTreeMock.mockResolvedValue({
        root: true,
        folders: [{ path: '[Gmail]', name: '[Gmail]', disabled: true, folders: [] }],
      })

      const client = new ImapClient()
      const tree = await client.listMailboxTree(ACCOUNT)

      expect(tree[0]).toMatchObject({ path: '[Gmail]', selectable: false })
    })

    it('surfaces a connection error and still logs out', async () => {
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'))

      const client = new ImapClient()
      await expect(client.listMailboxTree(ACCOUNT)).rejects.toThrow(ImapConnectionError)
      expect(logoutMock).not.toHaveBeenCalled() // never connected — nothing to log out of
    })

    it('logs out even when listing the tree fails', async () => {
      listTreeMock.mockRejectedValue(new Error('boom'))

      const client = new ImapClient()
      await expect(client.listMailboxTree(ACCOUNT)).rejects.toThrow(ImapConnectionError)
      expect(logoutMock).toHaveBeenCalledTimes(1)
    })
  })
})
