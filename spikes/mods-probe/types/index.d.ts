export type TurnRecord = {
  at: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
  isSubagent: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mods-probe': { last: TurnRecord | null; isHidden: boolean }
  }
}
