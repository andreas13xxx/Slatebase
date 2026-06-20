/**
 * Utility for mapping file extensions to specific file-type icons
 * using @react-symbols/icons for known types and Lucide as fallback.
 * Also handles stripping known extensions from display names.
 */
import { createElement } from 'react'
import type { ComponentType, SVGProps } from 'react'
import {
  Markdown, TypeScript, Js, Reactjs, Reactts,
  Python, Ruby, Rust, Go, Java, Kotlin, Swift,
  C, Cplus, Csharp, PHP, Lua, Shell, Dart, Scala,
  Clojure, Elixir, Zig, R, Perl, Julia, Vlang,
  Angular, Svelte, Vue,
  Sass, PostCSS, Tailwind,
  Graphql, Database,
  Yaml, Tsconfig, EditorConfig,
  Image, SVG as SvgIcon, Video, Audio,
  Document, Csv, Text, Notebook,
  Docker, Git, Ignore, License, Eslint, Prettier,
  NPM, PNPM, Yarn, Node, Deno, Vite, Webpack, Next, Nest,
  Exe, Patch,
  XML,
  Hugo, Terraform, Prisma, Firebase, Supabase,
  Jest, Cypress, Storybook,
  Http, Gear,
} from '@react-symbols/icons'
import {
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileType2,
  Film,
  LayoutDashboard,
  Presentation,
  ScrollText,
  StickyNote,
  File,
  type LucideIcon,
} from 'lucide-react'

/** Union type for both icon component types. */
type IconComponent = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon

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
  // Canvas
  'canvas',
])

/** Extension to icon mapping. Uses @react-symbols/icons where available. */
const EXTENSION_ICON_MAP: Record<string, IconComponent> = {
  // Markdown
  md: Markdown,
  mdx: Markdown,
  // Plain text
  txt: Text,
  rtf: Document,
  org: Notebook,
  // TypeScript
  ts: TypeScript,
  tsx: Reactts,
  // JavaScript
  js: Js,
  jsx: Reactjs,
  mjs: Js,
  cjs: Js,
  // Python
  py: Python,
  // Ruby
  rb: Ruby,
  // Rust
  rs: Rust,
  // Go
  go: Go,
  // Java / Kotlin
  java: Java,
  kt: Kotlin,
  // Swift
  swift: Swift,
  // C / C++
  c: C,
  cpp: Cplus,
  h: C,
  hpp: Cplus,
  // C#
  cs: Csharp,
  // PHP
  php: PHP,
  // Lua
  lua: Lua,
  // Shell
  sh: Shell,
  bash: Shell,
  zsh: Shell,
  ps1: Shell,
  bat: Shell,
  cmd: Shell,
  // Other languages
  r: R,
  dart: Dart,
  scala: Scala,
  clj: Clojure,
  ex: Elixir,
  exs: Elixir,
  erl: Elixir,
  zig: Zig,
  nim: Gear,
  v: Vlang,
  pl: Perl,
  jl: Julia,
  // Frontend frameworks
  vue: Vue,
  svelte: Svelte,
  angular: Angular,
  // Web — HTML/CSS
  html: Http,
  htm: Http,
  css: Tailwind,
  scss: Sass,
  sass: Sass,
  less: PostCSS,
  // SQL / GraphQL
  sql: Database,
  graphql: Graphql,
  gql: Graphql,
  // Config / Data — JSON
  json: Gear,
  jsonc: Gear,
  json5: Gear,
  // Config / Data — YAML
  yaml: Yaml,
  yml: Yaml,
  toml: Gear,
  // Config / Data — Other
  ini: EditorConfig,
  cfg: EditorConfig,
  conf: EditorConfig,
  xml: XML,
  env: EditorConfig,
  properties: EditorConfig,
  // Images — Raster
  png: Image,
  jpg: Image,
  jpeg: Image,
  webp: Image,
  avif: Image,
  bmp: Image,
  ico: Image,
  tiff: Image,
  tif: Image,
  // Images — GIF (animated)
  gif: Film,
  // Images — SVG (vector)
  svg: SvgIcon,
  // Video
  mp4: Video,
  webm: Video,
  mkv: Video,
  avi: Video,
  mov: Video,
  wmv: Video,
  flv: Video,
  // Audio
  mp3: Audio,
  wav: Audio,
  ogg: Audio,
  flac: Audio,
  aac: Audio,
  m4a: Audio,
  wma: FileAudio,
  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  bz2: FileArchive,
  xz: FileArchive,
  '7z': FileArchive,
  rar: FileArchive,
  // Documents — PDF
  pdf: ScrollText,
  // Documents — Word
  doc: Document,
  docx: Document,
  odt: Document,
  // Spreadsheets
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: Csv,
  ods: FileSpreadsheet,
  // Presentations
  ppt: Presentation,
  pptx: Presentation,
  odp: Presentation,
  // Fonts
  ttf: FileType2,
  otf: FileType2,
  woff: FileType2,
  woff2: FileType2,
  eot: FileType2,
  // Logs
  log: StickyNote,
  // Lock files
  lock: Gear,
  map: Gear,
  // Binary / System
  wasm: Exe,
  dll: Exe,
  so: Exe,
  exe: Exe,
  dylib: Exe,
  // Patch
  patch: Patch,
  diff: Patch,
  // Canvas
  canvas: LayoutDashboard,
}

/** Filename-based icon mapping for special config files. */
const FILENAME_ICON_MAP: Record<string, IconComponent> = {
  'dockerfile': Docker,
  'docker-compose.yml': Docker,
  'docker-compose.yaml': Docker,
  '.dockerignore': Docker,
  '.gitignore': Ignore,
  '.gitattributes': Git,
  '.gitmodules': Git,
  'license': License,
  'license.md': License,
  'licence': License,
  'licence.md': License,
  '.eslintrc': Eslint,
  '.eslintrc.js': Eslint,
  '.eslintrc.json': Eslint,
  'eslint.config.js': Eslint,
  'eslint.config.mjs': Eslint,
  'eslint.config.ts': Eslint,
  '.prettierrc': Prettier,
  '.prettierrc.json': Prettier,
  'prettier.config.js': Prettier,
  'prettier.config.mjs': Prettier,
  'package.json': NPM,
  'package-lock.json': NPM,
  'pnpm-lock.yaml': PNPM,
  'yarn.lock': Yarn,
  'tsconfig.json': Tsconfig,
  'tsconfig.app.json': Tsconfig,
  'tsconfig.node.json': Tsconfig,
  'vite.config.ts': Vite,
  'vite.config.js': Vite,
  'vitest.config.ts': Vite,
  'webpack.config.js': Webpack,
  'webpack.config.ts': Webpack,
  'next.config.js': Next,
  'next.config.mjs': Next,
  'next.config.ts': Next,
  'nest-cli.json': Nest,
  'deno.json': Deno,
  'deno.jsonc': Deno,
  '.node-version': Node,
  '.nvmrc': Node,
  'nodemon.json': Node,
  'jest.config.js': Jest,
  'jest.config.ts': Jest,
  'cypress.config.js': Cypress,
  'cypress.config.ts': Cypress,
  '.storybook': Storybook,
  'hugo.toml': Hugo,
  'hugo.yaml': Hugo,
  'terraform.tf': Terraform,
  'schema.prisma': Prisma,
  'firebase.json': Firebase,
  '.firebaserc': Firebase,
  'supabase.toml': Supabase,
  '.editorconfig': EditorConfig,
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

/** Props accepted by the unified file icon component. */
export interface FileIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

/** A unified file icon component type. */
export type FileIconComponent = ComponentType<FileIconProps>

/**
 * Returns a unified icon component for a given filename.
 * Checks filename-specific mappings first, then extension-based.
 * Falls back to generic File icon for unknown types.
 *
 * The returned component accepts { size, className, style } props uniformly,
 * regardless of whether the underlying icon is from @react-symbols or Lucide.
 */
export function getFileIcon(fileName: string): FileIconComponent {
  // Check full filename first (for special config files)
  const lowerName = fileName.toLowerCase()
  const filenameIcon = FILENAME_ICON_MAP[lowerName]
  if (filenameIcon) return wrapIcon(filenameIcon)

  // Check extension
  const ext = getFileExtension(fileName)
  if (!ext) return wrapIcon(File)
  return wrapIcon(EXTENSION_ICON_MAP[ext] ?? File)
}

/**
 * Returns the CSS color class for a given filename's icon.
 * Only needed for Lucide fallback icons — @react-symbols icons have built-in colors.
 * Returns empty string for @react-symbols icons (they handle their own colors).
 */
export function getFileIconClass(fileName: string): string {
  const icon = resolveRawIcon(fileName)
  if (isLucideIcon(icon)) {
    return getLucideColorClass(fileName)
  }
  return ''
}

/** Resolve the raw icon component for a filename (without wrapping). */
function resolveRawIcon(fileName: string): IconComponent {
  const lowerName = fileName.toLowerCase()
  const filenameIcon = FILENAME_ICON_MAP[lowerName]
  if (filenameIcon) return filenameIcon
  const ext = getFileExtension(fileName)
  if (!ext) return File
  return EXTENSION_ICON_MAP[ext] ?? File
}

/** Wraps an icon component to accept unified { size, className, style } props. */
function wrapIcon(Icon: IconComponent): FileIconComponent {
  if (isLucideIcon(Icon)) {
    // Lucide icons already accept `size`
    return Icon as unknown as FileIconComponent
  }
  // @react-symbols icons use width/height
  function SymbolIcon({ size = 16, className, style }: FileIconProps) {
    return createElement(Icon as ComponentType<SVGProps<SVGSVGElement>>, {
      width: size,
      height: size,
      className,
      style,
    })
  }
  SymbolIcon.displayName = `SymbolIcon(${(Icon as { displayName?: string }).displayName ?? 'Unknown'})`
  return SymbolIcon
}

/** Check if an icon is a Lucide icon (they have a displayName or specific structure). */
function isLucideIcon(icon: IconComponent): boolean {
  return icon === File || icon === FileArchive || icon === FileAudio
    || icon === FileSpreadsheet || icon === FileType2 || icon === Film
    || icon === LayoutDashboard || icon === Presentation || icon === ScrollText
    || icon === StickyNote
}

/** Color classes for Lucide fallback icons. */
function getLucideColorClass(fileName: string): string {
  const ext = getFileExtension(fileName)
  switch (ext) {
    case 'gif': return 'file-icon--gif'
    case 'zip': case 'tar': case 'gz': case 'bz2': case 'xz': case '7z': case 'rar':
      return 'file-icon--archive'
    case 'pdf': return 'file-icon--pdf'
    case 'xls': case 'xlsx': case 'ods':
      return 'file-icon--spreadsheet'
    case 'ppt': case 'pptx': case 'odp':
      return 'file-icon--presentation'
    case 'ttf': case 'otf': case 'woff': case 'woff2': case 'eot':
      return 'file-icon--font'
    case 'log': return 'file-icon--log'
    case 'wma': return 'file-icon--audio'
    case 'canvas': return 'file-icon--canvas'
    default: return 'file-icon--default'
  }
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
