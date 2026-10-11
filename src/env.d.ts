// Build-time switches Vite writes into the bundle.

interface ImportMetaEnv {
  /** '1' for the preview build served under /preview/ next to the real game. */
  readonly VITE_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
