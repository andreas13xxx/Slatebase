import { describe, it, expect } from 'vitest'
import {
  tableToTsv,
  tableToCsv,
  csvFileName,
  neutralizeSpreadsheetFormula,
  setActiveBasesController,
  clearActiveBasesController,
  getActiveBasesController,
  type ActiveBasesController,
} from './activeBasesBridge'

function makeController(): ActiveBasesController {
  return { nextView: () => false, addView: () => false, copyTable: async () => false, exportCsv: () => false, addItem: async () => null }
}

describe('active bases controller (identity-guarded clear)', () => {
  it('clearActiveBasesController only clears the slot the given controller still owns', () => {
    // Split Panes: two BasesViews mounted. The second to mount owns the slot.
    const first = makeController()
    const second = makeController()
    setActiveBasesController(first)
    setActiveBasesController(second)

    // The first instance unmounts and clears by its own identity — must NOT
    // null the slot the second instance now owns.
    clearActiveBasesController(first)
    expect(getActiveBasesController()).toBe(second)

    // The owning instance's clear does null the slot.
    clearActiveBasesController(second)
    expect(getActiveBasesController()).toBe(null)
  })
})

describe('tableToTsv', () => {
  it('joins cells with tabs and rows with newlines, dropping sort markers', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <table>
        <thead><tr><th>Name <span>▲</span></th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Idea</td><td>open</td></tr>
          <tr><td>Plan\twith tab</td><td>multi
line</td></tr>
        </tbody>
      </table>`
    const table = host.querySelector('table') as HTMLTableElement
    expect(tableToTsv(table)).toBe('Name\tStatus\nIdea\topen\nPlan with tab\tmulti line')
  })
})

function tableFrom(rows: string[][]): HTMLTableElement {
  const table = document.createElement('table')
  for (const cells of rows) {
    const tr = table.insertRow()
    for (const text of cells) tr.insertCell().textContent = text
  }
  return table
}

describe('tableToCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(tableToCsv(tableFrom([['Name', 'Status'], ['Idea', 'open']]))).toBe('Name,Status\r\nIdea,open')
  })

  it('quotes fields with commas, quotes and line breaks, doubling the quotes', () => {
    const csv = tableToCsv(tableFrom([['a,b', 'say "hi"', 'x\ny']]))
    // Line breaks inside a cell collapse to a space, so only the comma and quote cases need quoting.
    expect(csv).toBe('"a,b","say ""hi""",x y')
  })

  it('drops sort markers from the header', () => {
    expect(tableToCsv(tableFrom([['Name ▲', 'Status']]))).toBe('Name,Status')
  })

  it('keeps umlauts and empty cells', () => {
    expect(tableToCsv(tableFrom([['Übung', '', 'ß']]))).toBe('Übung,,ß')
  })
})

describe('neutralizeSpreadsheetFormula', () => {
  it.each(['=1+1', '+SUM(A1)', '@cmd', '-2+3', '-cmd|x', '- list item', '-5a'])('prefixes %j so it is not run as a formula', (text) => {
    expect(neutralizeSpreadsheetFormula(text)).toBe(`'${text}`)
  })

  it.each(['-5', '-0.5', '-0,5', '-', 'plain', '2026-11-13', 'a=b', ''])('leaves %j alone', (text) => {
    expect(neutralizeSpreadsheetFormula(text)).toBe(text)
  })

  it('is applied while exporting', () => {
    expect(tableToCsv(tableFrom([['=HYPERLINK("x")']]))).toBe('"\'=HYPERLINK(""x"")"')
  })
})

describe('csvFileName', () => {
  it('uses the base name', () => {
    expect(csvFileName('Projekte/Aufgaben.base')).toBe('Aufgaben.csv')
    expect(csvFileName('x.BASE')).toBe('x.csv')
  })
  it('falls back to "base"', () => {
    expect(csvFileName(undefined)).toBe('base.csv')
    expect(csvFileName('')).toBe('base.csv')
    expect(csvFileName('.base')).toBe('base.csv')
  })
})
