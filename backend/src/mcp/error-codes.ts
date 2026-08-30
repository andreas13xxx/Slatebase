// Shared JSON-RPC-style error codes used across MCP resource and tool handlers.
// Range -32000 to -32099 is reserved for implementation-defined server errors
// per the JSON-RPC 2.0 spec, which the MCP protocol builds on.

/** Access denied — user does not have permission for this vault. */
export const MCP_ERROR_ACCESS_DENIED = -32001
/** Resource not found — file or vault does not exist. */
export const MCP_ERROR_NOT_FOUND = -32002
/**
 * Reserved. Was "Binary files not supported" — no longer emitted since binary
 * files are served base64-encoded (`read_file`, `resources/read`). Kept so the
 * code is not reused for something else.
 */
export const MCP_ERROR_BINARY_FILE = -32003
/** File too large — exceeds configured maxFileSize. */
export const MCP_ERROR_FILE_TOO_LARGE = -32004
/** Conflict — e.g. a file/folder already exists at the target path. */
export const MCP_ERROR_CONFLICT = -32005
/** Storage error — an unexpected filesystem failure occurred. */
export const MCP_ERROR_STORAGE = -32006
/** Invalid params — standard JSON-RPC "invalid params" code. */
export const MCP_ERROR_INVALID_PARAMS = -32602
