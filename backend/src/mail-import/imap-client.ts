// ImapClient — thin wrapper around imapflow for polling unseen messages.
//
// Dedup relies on the IMAP server's own \Seen flag rather than a locally
// tracked UID watermark: each run lists currently-unseen messages, and the
// caller marks a message \Seen only after successfully importing it (see
// MailImportEngine). A message that fails mid-import stays unseen and is
// retried on the next run; a message already marked \Seen is never fetched
// again.

import { ImapFlow, type ListTreeResponse } from 'imapflow'
import { ImapConnectionError } from './errors.js'

/** Credentials for one IMAP account, without a specific mailbox selected. */
export interface ImapAccountConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

export interface ImapConnectionConfig extends ImapAccountConfig {
  mailbox: string
}

export interface FetchedMessage {
  uid: number
  source: Buffer
}

/** One node of a mailbox folder tree, for building a folder picker. */
export interface MailboxTreeNode {
  /** Exact IMAP path to use as a mail-import config's `mailbox` value. */
  path: string
  /** Display name (last path segment). */
  name: string
  /** False for a folder the server reports as non-selectable (a pure container node). */
  selectable: boolean
  children: MailboxTreeNode[]
}

/**
 * imapflow raises nearly every server-rejected command (failed login, unknown
 * mailbox, ...) as a generic `Error('Command failed')`, with the server's
 * actual reason attached as `responseText` rather than in `.message`. Without
 * this, every failure surfaces as the meaningless "Command failed" and hides
 * the one piece of information (e.g. "Login failed", "Mailbox doesn't
 * exist") that would let anyone diagnose it.
 */
function describeImapError(error: unknown): string {
  if (error instanceof Error) {
    const responseText = (error as { responseText?: unknown }).responseText
    if (typeof responseText === 'string' && responseText.length > 0) {
      return responseText
    }
    return error.message
  }
  return String(error)
}

function toMailboxTreeNode(node: ListTreeResponse): MailboxTreeNode {
  return {
    path: node.path ?? '',
    name: node.name ?? node.path ?? '',
    selectable: !node.disabled,
    children: (node.folders ?? []).map(toMailboxTreeNode),
  }
}

/** One open, authenticated IMAP session against a single mailbox. */
export interface IImapConnection {
  /** UIDs of currently-unseen messages in the mailbox, ascending (oldest first). */
  listUnseenUids(): Promise<number[]>
  /** Fetches one message's raw RFC822 source by UID. */
  fetchMessage(uid: number): Promise<Buffer>
  /** Marks one message \Seen. Call only after it has been fully imported. */
  markAsRead(uid: number): Promise<void>
  /** Closes the mailbox lock and logs out. Always call in a `finally`. */
  close(): Promise<void>
}

export interface IImapClient {
  /** Connects and authenticates, then opens `config.mailbox`. */
  connect(config: ImapConnectionConfig): Promise<IImapConnection>
  /**
   * Connects and authenticates, then returns the account's full mailbox
   * folder tree — lets a user pick the exact IMAP path instead of guessing
   * hierarchy separators/prefixes (e.g. "000" vs "INBOX.000" vs "INBOX/000").
   */
  listMailboxTree(account: ImapAccountConfig): Promise<MailboxTreeNode[]>
}

class ImapConnection implements IImapConnection {
  constructor(
    private readonly client: ImapFlow,
    private readonly lock: { release(): void },
  ) {}

  async listUnseenUids(): Promise<number[]> {
    // Deliberately not `search({ seen: false })`: verified against a real
    // account where the server's own STATUS command reported UNSEEN=2 (and a
    // direct FETCH confirmed neither message carried \Seen), yet SEARCH
    // UNSEEN still came back empty — a real-world server-side SEARCH
    // inconsistency, not a hypothetical one. Fetching FLAGS for every
    // message and filtering client-side never depends on the server
    // evaluating a SEARCH criterion correctly, only on it reporting flags
    // accurately (which STATUS and FETCH agreed on).
    try {
      const uids: number[] = []
      for await (const message of this.client.fetch('1:*', { uid: true, flags: true }, { uid: true })) {
        if (!message.flags?.has('\\Seen')) {
          uids.push(message.uid)
        }
      }
      uids.sort((a, b) => a - b)
      return uids
    } catch (error) {
      throw new ImapConnectionError(`Failed to list unseen messages: ${describeImapError(error)}`)
    }
  }

  async fetchMessage(uid: number): Promise<Buffer> {
    try {
      const message = await this.client.fetchOne(uid, { source: true }, { uid: true })
      if (!message || !message.source) {
        throw new Error(`Message ${uid} has no source`)
      }
      return message.source
    } catch (error) {
      throw new ImapConnectionError(`Failed to fetch message ${uid}: ${describeImapError(error)}`)
    }
  }

  async markAsRead(uid: number): Promise<void> {
    try {
      await this.client.messageFlagsAdd([uid], ['\\Seen'], { uid: true })
    } catch (error) {
      throw new ImapConnectionError(`Failed to mark message ${uid} as read: ${describeImapError(error)}`)
    }
  }

  async close(): Promise<void> {
    try {
      this.lock.release()
    } finally {
      await this.client.logout().catch(() => { /* connection may already be closed */ })
    }
  }
}

export class ImapClient implements IImapClient {
  async connect(config: ImapConnectionConfig): Promise<IImapConnection> {
    const client = await this.connectAccount(config)

    let lock
    try {
      lock = await client.getMailboxLock(config.mailbox)
    } catch (error) {
      await client.logout().catch(() => { /* connection may already be closed */ })
      throw new ImapConnectionError(`Failed to open mailbox "${config.mailbox}": ${describeImapError(error)}`)
    }

    return new ImapConnection(client, lock)
  }

  async listMailboxTree(account: ImapAccountConfig): Promise<MailboxTreeNode[]> {
    const client = await this.connectAccount(account)
    try {
      const tree = await client.listTree()
      return (tree.folders ?? []).map(toMailboxTreeNode)
    } catch (error) {
      throw new ImapConnectionError(`Failed to list mailboxes: ${describeImapError(error)}`)
    } finally {
      await client.logout().catch(() => { /* connection may already be closed */ })
    }
  }

  private async connectAccount(account: ImapAccountConfig): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.username, pass: account.password },
      logger: false,
    })

    try {
      await client.connect()
    } catch (error) {
      throw new ImapConnectionError(
        `Failed to connect to ${account.host}:${account.port}: ${describeImapError(error)}`,
      )
    }

    return client
  }
}
