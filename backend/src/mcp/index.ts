// ─── MCP Module ──────────────────────────────────────────────────────────────
// Barrel export for the MCP module.

// Data models and types
export type {
  TokenRecord,
  UserTokenIndex,
  ApiTokenInfo,
  TokenCreateResult,
  McpTokenContext,
} from './types.js'

// Note: McpConfig is exported from config.ts (canonical definition with JSDoc)
export type { McpConfig } from './config.js'

// Configuration loader
export { loadMcpConfig } from './config.js'

// Error classes
export {
  McpAuthenticationError,
  TokenLimitError,
  TokenValidationError,
  McpRateLimitError,
  McpDisabledError,
  TokenNotFoundError,
} from './errors.js'

// Validation schemas and inferred types
export {
  createTokenSchema,
  vaultIdParamSchema,
  getVaultStructureParamsSchema,
  searchVaultParamsSchema,
  readFileParamsSchema,
} from './validation.js'

export type {
  CreateTokenInput,
  VaultIdParam,
  GetVaultStructureParams,
  SearchVaultParams,
  ReadFileParams,
} from './validation.js'

// Token store
export type { ITokenStore } from './token-store.js'
export { TokenStore } from './token-store.js'

// Token service
export type { IMcpTokenService } from './token-service.js'
export { McpTokenService } from './token-service.js'

// Rate limiter
export type { IMcpRateLimiter } from './rate-limiter.js'
export { McpRateLimiter } from './rate-limiter.js'

// Handlers
export type { IMcpHandlers, McpHandlersDeps } from './handlers.js'
export { McpHandlers, McpError } from './handlers.js'

// Tool handlers
export type { ToolHandlerDeps } from './tool-handlers.js'
export { registerToolHandlers } from './tool-handlers.js'

// Server factory
export type { IMcpServerFactory, McpServerFactoryDeps } from './server-factory.js'
export { McpServerFactory } from './server-factory.js'
