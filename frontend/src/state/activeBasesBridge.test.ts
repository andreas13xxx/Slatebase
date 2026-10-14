import { describe, it, expect } from 'vitest'
import { tableToTsv } from './activeBasesBridge'

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
