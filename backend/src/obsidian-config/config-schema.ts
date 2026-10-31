// Request schema of a config file, built from its key table in shared-contracts: every key is
// optional and may be `null`, which removes it from the file (back to the default). Keys that are not
// in the table are rejected, not ignored.

import { z } from 'zod'
import { configValueProblem, type ConfigKeyMeta, type ConfigTable } from '@slatebase/shared-contracts'

function valueSchema(meta: ConfigKeyMeta): z.ZodType {
  switch (meta.kind) {
    case 'boolean': return z.boolean()
    case 'number': return z.number().min(meta.min).max(meta.max)
    case 'string': {
      const base = z.string().max(meta.maxLength)
      return meta.pattern === undefined ? base : base.refine((value) => configValueProblem(meta, value) === null, meta.patternHint ?? 'value not allowed')
    }
    case 'enum': return z.enum(meta.values as [string, ...string[]])
    case 'string[]': return z.array(z.string().max(meta.maxLength)).max(meta.maxItems)
    case 'json': return z.unknown().refine((value) => value !== undefined && configValueProblem(meta, value) === null, `value larger than ${meta.maxBytes} bytes`)
  }
}

export function configRequestSchema(table: ConfigTable) {
  return z.object(
    Object.fromEntries(Object.entries(table).map(([key, meta]) => [key, valueSchema(meta).nullable().optional()])),
  ).strict()
}
