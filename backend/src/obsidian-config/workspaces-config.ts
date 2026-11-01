// `<vault>/.obsidian/workspaces.json` — the vault's saved layouts (see @slatebase/shared-contracts).
// A PATCH changes single layouts: `workspaces` maps a name to its layout (set) or `null` (delete),
// `active` names the layout last saved (`null` removes it). Everything else in the file — layouts
// the patch does not name, fields Obsidian or a plugin put there — stays as it is.

import { z } from 'zod'
import {
  MAX_WORKSPACES,
  MAX_WORKSPACE_LAYOUT_BYTES,
  describeWorkspacesDeviations,
  isValidWorkspaceName,
} from '@slatebase/shared-contracts'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

const layoutSchema = z.record(z.string(), z.unknown()).refine(
  (layout) => JSON.stringify(layout).length <= MAX_WORKSPACE_LAYOUT_BYTES,
  'layout too large',
)

export const workspacesConfigRequestSchema = z.object({
  workspaces: z
    .record(z.string(), layoutSchema.nullable())
    .refine((map) => Object.keys(map).length <= MAX_WORKSPACES, 'too many workspaces')
    .refine((map) => Object.keys(map).every(isValidWorkspaceName), 'not a usable workspace name')
    .optional(),
  active: z.string().max(200).nullable().optional(),
}).strict()

export interface WorkspacesConfigRequest {
  workspaces?: Record<string, Record<string, unknown> | null>
  active?: string | null
}

export interface IWorkspacesConfigService {
  /** All fields of workspaces.json; an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: WorkspacesConfigRequest): Promise<Record<string, unknown>>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class WorkspacesConfigService implements IWorkspacesConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readObsidianConfig(vaultPath, 'workspaces.json')) ?? {}
    this.reporter.report(vaultId, 'workspaces.json', describeWorkspacesDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })))
    return fields
  }

  async patch(vaultPath: string, patch: WorkspacesConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'workspaces.json', (current) => {
      let changed = false
      if (patch.workspaces !== undefined) {
        // A copy with no prototype: the names come from a request and are only ever keys
        const layouts: Record<string, unknown> = Object.assign(
          Object.create(null) as Record<string, unknown>,
          isObject(current['workspaces']) ? current['workspaces'] : {},
        )
        for (const [name, layout] of Object.entries(patch.workspaces)) {
          if (layout === null) {
            if (name in layouts) {
              delete layouts[name]
              changed = true
            }
          } else if (JSON.stringify(layouts[name]) !== JSON.stringify(layout)) {
            layouts[name] = layout
            changed = true
          }
        }
        if (changed) current['workspaces'] = { ...layouts }
      }
      if (patch.active !== undefined) {
        if (patch.active === null) {
          if ('active' in current) {
            delete current['active']
            changed = true
          }
        } else if (current['active'] !== patch.active) {
          current['active'] = patch.active
          changed = true
        }
      }
      return changed ? current : null
    })
  }
}
