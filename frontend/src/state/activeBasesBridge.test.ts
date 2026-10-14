import { describe, it, expect } from 'vitest'
import {
  tableToTsv,
  setActiveBasesController,
  clearActiveBasesController,
  getActiveBasesController,
  type ActiveBasesController,
} from './activeBasesBridge'

function makeController(): ActiveBasesController {
  return { nextView: () => false, addView: () => false, copyTable: async () => false }
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
