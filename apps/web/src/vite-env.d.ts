/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Only used by `npm run dev:web`; Electron provides the connection through the preload script. */
  readonly VITE_API_URL?: string;
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
