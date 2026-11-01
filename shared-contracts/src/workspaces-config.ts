// `<vault>/.obsidian/workspaces.json` — the saved layouts of a vault, same for everyone who opens it:
//
//   { "workspaces": { "Writing": { "main": { "type": "split", "direction": "vertical", "children": [ ... ] },
//                                  "active": "<leaf id>", "lastOpenFiles": [ "Note.md" ],
//                                  "slatebase": { "savedAt": "...", "paneTree": { ... } } } },
//     "active": "Writing" }
//
// Obsidian's core Workspaces plugin keeps this shape: `workspaces` maps a name to a layout like
// workspace.json's (`main`, `left`, `right`, `active`, `lastOpenFiles`), `active` names the layout last
// saved or loaded. The `main` tree is what Obsidian reads; the `slatebase` block carries Slatebase's own
// snapshot (pane tree and panel layouts) so loading it here loses nothing. A layout without that block is
// read from `main`. Seen in real files: `workspaces`, `active`; the layout fields are workspace.json's and
// were not seen inside a workspaces.json — assumed, with `slatebase` Slatebase's own addition.

/** Most layouts a vault may keep; a guard, not a product limit (Obsidian has none). */
export const MAX_WORKSPACES = 500

/** Longest workspace name, and the largest layout (as JSON) accepted in a request. */
export const MAX_WORKSPACE_NAME_LENGTH = 200
export const MAX_WORKSPACE_LAYOUT_BYTES = 1024 * 1024

const RESERVED_NAMES: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** Whether `name` may be a key of the file: not empty, no control characters, not a name that reaches the prototype. */
export function isValidWorkspaceName(name: string): boolean {
  // eslint-disable-next-line no-control-regex
  return name.trim().length > 0 && name.length <= MAX_WORKSPACE_NAME_LENGTH && !/[\u0000-\u001f\u007f]/.test(name) && !RESERVED_NAMES.has(name)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** What is wrong with the file, for the console (Requirement 8). Nothing is rewritten for it. */
export function describeWorkspacesDeviations(fields: Record<string, unknown>): Array<{ key: string; reason: string }> {
  const deviations: Array<{ key: string; reason: string }> = []
  const workspaces = fields['workspaces']
  if (workspaces !== undefined && !isObject(workspaces)) {
    deviations.push({ key: 'workspaces', reason: 'expected an object of named layouts' })
  } else if (isObject(workspaces)) {
    for (const [name, layout] of Object.entries(workspaces)) {
      if (!isValidWorkspaceName(name)) deviations.push({ key: `workspaces.${name.slice(0, 80)}`, reason: 'not a usable workspace name' })
      else if (!isObject(layout)) deviations.push({ key: `workspaces.${name}`, reason: 'expected a layout object' })
      else if (layout['main'] !== undefined && !isObject(layout['main'])) deviations.push({ key: `workspaces.${name}.main`, reason: 'expected a layout tree' })
    }
  }
  const active = fields['active']
  if (active !== undefined && typeof active !== 'string') deviations.push({ key: 'active', reason: 'expected the name of a workspace' })
  return deviations
}
