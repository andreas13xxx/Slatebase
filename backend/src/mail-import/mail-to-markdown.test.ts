import { describe, it, expect } from 'vitest'
import { convertMailToMarkdown } from './mail-to-markdown.js'

function buildRawMail(options: { html?: string; text?: string; withAttachment?: boolean; withInlineImage?: boolean }): Buffer {
  const boundary = 'BOUNDARY123'
  const parts: string[] = [
    'From: Alice Example <alice@example.invalid>',
    'To: Bob Example <bob@example.invalid>',
    'Subject: Test / Betreff: Ä Ö Ü',
    'Date: Mon, 05 Jan 2026 10:30:00 +0000',
    'Message-ID: <abc123@example.invalid>',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    'MIME-Version: 1.0',
    '',
    `--${boundary}`,
  ]

  if (options.html) {
    parts.push('Content-Type: text/html; charset=utf-8', '', options.html, `--${boundary}`)
  } else if (options.text) {
    parts.push('Content-Type: text/plain; charset=utf-8', '', options.text, `--${boundary}`)
  }

  if (options.withInlineImage) {
    parts.push(
      'Content-Type: image/png',
      'Content-Disposition: inline',
      'Content-ID: <inline-1>',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('fake-inline-image').toString('base64'),
      `--${boundary}`,
    )
  }

  if (options.withAttachment) {
    parts.push(
      'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="invoice.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('fake-pdf-content').toString('base64'),
      `--${boundary}`,
    )
  }

  parts.push('')
  return Buffer.from(parts.join('\r\n'))
}

describe('convertMailToMarkdown', () => {
  it('extracts subject, from, to, date and message id into YAML frontmatter', async () => {
    const raw = buildRawMail({ text: 'Hello world' })
    const result = await convertMailToMarkdown(raw)

    expect(result.markdown).toMatch(/^---\n/)
    expect(result.markdown).toContain('from: "\\"Alice Example\\" <alice@example.invalid>"')
    expect(result.markdown).toContain('to: "\\"Bob Example\\" <bob@example.invalid>"')
    expect(result.markdown).toContain('messageId: "<abc123@example.invalid>"')
    expect(result.subject).toContain('Betreff')
  })

  it('converts an HTML body to Markdown via turndown', async () => {
    const raw = buildRawMail({ html: '<p>Hello <strong>world</strong></p>' })
    const result = await convertMailToMarkdown(raw)

    expect(result.markdown).toContain('**world**')
  })

  it('falls back to the plain text body when there is no HTML part', async () => {
    const raw = buildRawMail({ text: 'Plain text body' })
    const result = await convertMailToMarkdown(raw)

    expect(result.markdown).toContain('Plain text body')
  })

  it('includes regular attachments but excludes inline/related images', async () => {
    const raw = buildRawMail({ html: '<p>See attached <img src="cid:inline-1"></p>', withAttachment: true, withInlineImage: true })
    const result = await convertMailToMarkdown(raw)

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]?.filename).toBe('invoice.pdf')
    expect(result.attachments[0]?.content.toString()).toBe('fake-pdf-content')
  })

  it('escapes double quotes in frontmatter values', async () => {
    const boundary = 'B2'
    const raw = Buffer.from([
      'From: "Weird \\"Name\\"" <weird@example.invalid>',
      'To: bob@example.invalid',
      'Subject: Has "quotes" inside',
      'Date: Mon, 05 Jan 2026 10:30:00 +0000',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      'body',
      `--${boundary}--`,
      '',
    ].join('\r\n'))

    const result = await convertMailToMarkdown(raw)
    expect(result.markdown).toContain('subject: "Has \\"quotes\\" inside"')
  })
})
