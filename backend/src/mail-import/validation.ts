// Mail-Import Validation — Zod schemas

import { z } from 'zod'

const targetFolderSchema = z.string().max(1024, 'targetFolder too long').refine(
  (val) => !val.includes('\0'),
  { message: 'targetFolder contains invalid characters' },
)

export const createMailImportConfigSchema = z.object({
  name: z.string().min(1, 'name must not be empty').max(128, 'name too long'),
  host: z.string().min(1, 'host must not be empty').max(255, 'host too long'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1, 'username must not be empty').max(255, 'username too long'),
  password: z.string().min(1, 'password must not be empty').max(10_000, 'password too long'),
  mailbox: z.string().min(1).max(255).optional().default('INBOX'),
  targetFolder: targetFolderSchema.optional().default(''),
  intervalMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean().optional().default(true),
})
export type CreateMailImportConfigInput = z.infer<typeof createMailImportConfigSchema>

export const updateMailImportConfigSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(10_000).optional(),
  mailbox: z.string().min(1).max(255).optional(),
  targetFolder: targetFolderSchema.optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
})
export type UpdateMailImportConfigInput = z.infer<typeof updateMailImportConfigSchema>

export const mailImportVaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
})

export const mailImportConfigIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
  configId: z.string().min(1, 'configId must not be empty'),
})
