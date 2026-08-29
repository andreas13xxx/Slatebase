// mail-to-markdown — converts a raw RFC822 message into a Markdown note
// (YAML frontmatter + body) plus its non-inline attachments.

import { simpleParser, type AddressObject } from 'mailparser'
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

function formatAddress(address: AddressObject | AddressObject[] | undefined): string {
  if (!address) return ''
  return Array.isArray(address) ? address.map((a) => a.text).join(', ') : address.text
}

/** Escapes a value for a double-quoted YAML scalar. */
function yamlQuoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export async function convertMailToMarkdown(raw: Buffer): Promise<ConvertedMail> {
  const parsed = await simpleParser(raw)

  const subject = parsed.subject ?? '(kein Betreff)'
  const date = parsed.date ?? new Date()
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
    // mailparser already embeds cid: images referenced by the HTML body as
    // inline data: URIs, so anything marked contentDisposition "inline"
    // (rather than "attachment") is already part of the body and doesn't
    // need a separate attachment file/link. Note: `related` is not a
    // reliable signal here — mailparser leaves it undefined even for
    // successfully cid-embedded images.
    .filter((attachment) => attachment.contentDisposition !== 'inline')
    .map((attachment, index) => ({
      filename: attachment.filename ?? `attachment-${index + 1}`,
      content: attachment.content,
      contentType: attachment.contentType,
    }))

  return { markdown: `${frontmatter}${body}\n`, attachments, subject, date }
}
