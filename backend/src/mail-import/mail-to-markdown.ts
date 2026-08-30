// mail-to-markdown — converts a raw RFC822 message into a Markdown note
// (YAML frontmatter + body) plus its non-inline attachments.

import PostalMime, { type Address } from 'postal-mime'
import TurndownService from 'turndown'

export interface ConvertedAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface ConvertedMail {
  markdown: string
  attachments: ConvertedAttachment[]
  subject: string
  date: Date
}

const turndownService = new TurndownService()

/** Renders a single mailbox the way mail clients display it: `"Name" <address>`, or bare `address` when there's no display name. */
function formatMailbox(name: string, address: string): string {
  return name ? `"${name.replaceAll('"', '\\"')}" <${address}>` : address
}

function formatAddress(address: Address | Address[] | undefined): string {
  if (!address) return ''
  const list = Array.isArray(address) ? address : [address]
  return list
    .map((entry) => (entry.group ? entry.group.map((m) => formatMailbox(m.name, m.address)).join(', ') : formatMailbox(entry.name, entry.address ?? '')))
    .join(', ')
}

/** Escapes a value for a double-quoted YAML scalar. */
function yamlQuoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** postal-mime returns `date` as an ISO string (or the raw header value if parsing failed) rather than a Date. */
function parseDate(value: string | undefined): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

/** postal-mime's `content` is a string only when `attachmentEncoding` is set (we don't set it), otherwise an ArrayBuffer/Uint8Array. */
function attachmentContentToBuffer(content: ArrayBuffer | Uint8Array | string): Buffer {
  if (typeof content === 'string') return Buffer.from(content, 'utf-8')
  return content instanceof Uint8Array ? Buffer.from(content) : Buffer.from(content)
}

export async function convertMailToMarkdown(raw: Buffer): Promise<ConvertedMail> {
  const parsed = await PostalMime.parse(raw)

  const subject = parsed.subject ?? '(kein Betreff)'
  const date = parseDate(parsed.date)
  const from = formatAddress(parsed.from)
  const to = formatAddress(parsed.to)
  const messageId = parsed.messageId ?? ''

  const body = parsed.html ? turndownService.turndown(parsed.html) : (parsed.text ?? '')

  const frontmatter = [
    '---',
    `from: ${yamlQuoted(from)}`,
    `to: ${yamlQuoted(to)}`,
    `subject: ${yamlQuoted(subject)}`,
    `date: ${date.toISOString()}`,
    `messageId: ${yamlQuoted(messageId)}`,
    '---',
    '',
  ].join('\n')

  const attachments: ConvertedAttachment[] = parsed.attachments
    // postal-mime already embeds cid: images referenced by the HTML body as
    // inline data: URIs, so anything marked disposition "inline" (rather than
    // "attachment" or null) is already part of the body and doesn't need a
    // separate attachment file/link.
    .filter((attachment) => attachment.disposition !== 'inline')
    .map((attachment, index) => ({
      filename: attachment.filename ?? `attachment-${index + 1}`,
      content: attachmentContentToBuffer(attachment.content),
      contentType: attachment.mimeType,
    }))

  return { markdown: `${frontmatter}${body}\n`, attachments, subject, date }
}
