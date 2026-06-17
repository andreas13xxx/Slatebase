/**
 * Formats bytes into a human-readable size string.
 * Uses the largest applicable unit (Bytes, KB, MB, GB) with max 2 decimal places.
 * Trailing zeros after the decimal point are stripped.
 *
 * @param bytes - Size in bytes (non-negative integer)
 * @returns Human-readable size string (e.g., "1.5 MB", "42 Bytes")
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Bytes`
  }

  if (bytes < 1_048_576) {
    return `${stripTrailingZeros((bytes / 1024).toFixed(2))} KB`
  }

  if (bytes < 1_073_741_824) {
    return `${stripTrailingZeros((bytes / 1_048_576).toFixed(2))} MB`
  }

  return `${stripTrailingZeros((bytes / 1_073_741_824).toFixed(2))} GB`
}

/**
 * Removes trailing zeros after the decimal point.
 * If all decimals are zero, removes the decimal point as well.
 */
function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) return value
  let result = value.replace(/0+$/, '')
  if (result.endsWith('.')) {
    result = result.slice(0, -1)
  }
  return result
}
