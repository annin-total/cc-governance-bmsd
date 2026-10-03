export type Notice = { id: string; title?: string; body?: string; url?: string }

declare module 'claude-code' {
  interface PluginState {
    governance: { seen: string[]; warn: string | null }
  }
}
