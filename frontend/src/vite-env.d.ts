/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Release version baked in at build time (see frontend/Dockerfile). Absent in dev. */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
