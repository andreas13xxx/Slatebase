/**
 * Utility for mapping file extensions to Lucide icons and stripping
 * known extensions from display names in the file explorer and tabs.
 */
import {
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  FileType,
  FileSpreadsheet,
  FileArchive,
  Presentation,
  type LucideIcon,
} from 'lucide-react'

/** Known file extensions that should be hidden from display names. */
const KNOWN_EXTENSIONS = new Set([
  // Markdown / Text
  'md', 'mdx', 'txt', 'rtf', 'org',
  // Code
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'lua', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'sql', 'graphql', 'gql',
  'r', 'dart', 'scala', 'clj', 'ex', 'exs', 'erl', 'zig', 'nim', 'v',
  // Config / Data
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'xml', 'svg', 'env', 'properties',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tiff', 'tif',
  // Video
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv',
  // Audio
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
  // Archives
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'csv',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Other
  'log', 'lock', 'map', 'wasm', 'dll', 'so', 'dylib', 'exe',
])

/** Icon mapping by extension group. */
const EXTENSION_ICON_MAP: Record<string, LucideIcon> = {
  // Markdown
  md: FileText,
  mdx: FileText,
  txt: FileText,
  rtf: FileText,
  org: FileText,
  // Code
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  rb: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  kt: FileCode,
  swift: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  cs: FileCode,
  php: FileCode,
  lua: FileCode,
  sh: FileCode,
  bash: FileCode,
  zsh: FileCode,
  ps1: FileCode,
  bat: FileCode,
  cmd: FileCode,
  r: FileCode,
  dart: FileCode,
  scala: FileCode,
  clj: FileCode,
  ex: FileCode,
  exs: FileCode,
  erl: FileCode,
  zig: FileCode,
  nim: FileCode,
  v: FileCode,
  // Web
  html: FileCode,
  htm: FileCode,
  css: FileCode,
  scss: FileCode,
  sass: FileCode,
  less: FileCode,
  sql: FileCode,
  graphql: FileCode,
  gql: FileCode,
  // Config / Data
  json: FileJson,
  jsonc: FileJson,
  json5: FileJson,
  yaml: FileJson,
  yml: FileJson,
  toml: FileJson,
  ini: FileJson,
  cfg: FileJson,
  conf: FileJson,
  xml: FileJson,
  env: FileJson,
  properties: FileJson,
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  avif: FileImage,
  bmp: FileImage,
  ico: FileImage,
  tiff: FileImage,
  tif: FileImage,
  svg: FileImage,
  // Video
  mp4: FileVideo,
  webm: FileVideo,
  mkv: FileVideo,
  avi: FileVideo,
  mov: FileVideo,
  wmv: FileVideo,
  flv: FileVideo,
  // Audio
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  aac: FileAudio,
  m4a: FileAudio,
  wma: FileAudio,
  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  bz2: FileArchive,
  xz: FileArchive,
  '7z': FileArchive,
  rar: FileArchive,
  // Documents
  pdf: FileType,
  doc: FileType,
  docx: FileType,
  odt: FileType,
  // Spreadsheets
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  ods: FileSpreadsheet,
  // Presentations
  ppt: Presentation,
  pptx: Presentation,
  odp: Presentation,
  // Fonts / Binary
  ttf: File,
  otf: File,
  woff: File,
  woff2: File,
  eot: File,
  log: FileText,
  lock: FileJson,
  map: FileJson,
  wasm: File,
  dll: File,
  so: File,
  dylib: File,
  exe: File,
}

/**
 * Extracts the file extension (lowercase, without dot) from a filename.
 * Returns empty string if no extension found.
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === fileName.length - 1) return ''
  return fileName.slice(lastDot + 1).toLowerCase()
}

/**
 * Returns the appropriate Lucide icon component for a given filename.
 * Falls back to generic File icon for unknown extensions.
 */
export function getFileIcon(fileName: string): LucideIcon {
  const ext = getFileExtension(fileName)
  if (!ext) return File
  return EXTENSION_ICON_MAP[ext] ?? File
}

/**
 * Returns the display name for a file, stripping known extensions.
 * Unknown extensions are kept to avoid ambiguity.
 */
export function getDisplayName(fileName: string): string {
  const ext = getFileExtension(fileName)
  if (!ext || !KNOWN_EXTENSIONS.has(ext)) return fileName
  const lastDot = fileName.lastIndexOf('.')
  return fileName.slice(0, lastDot)
}
