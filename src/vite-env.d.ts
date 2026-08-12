interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_BASE_URL?: string
  readonly VITE_ENABLE_DEMO_DATA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
