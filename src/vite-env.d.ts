/// <reference types="vite/client" />

/** App version injected by Vite's `define` from package.json. */
declare const __APP_VERSION__: string

/**
 * Client build target injected by Vite's `define`:
 *  - "tauri": desktop thick/thin client (default; runs local Tauri bindings).
 *  - "web":   browser/PWA thin client (talks to the server over HTTP/SSE).
 */
declare const __CLIENT_TARGET__: "tauri" | "web"
