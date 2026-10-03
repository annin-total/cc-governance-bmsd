import { maskText } from './mask'

type Rec = Record<string, unknown>

export type Record_ = { counts: Record<string, number>; turns: Rec[]; lastStep: Rec | null }

export const KEY_PREFIX = 'rec:'
const MAX_SESSIONS = 10
const MAX_TURNS = 3

export function emptyRecord(): Record_ {
  return { counts: {}, turns: [], lastStep: null }
}

export function bump(rec: Record_, name: string): void {
  rec.counts[name] = (rec.counts[name] ?? 0) + 1
}

export function turnRow(e: Rec, context: unknown): Rec {
  const usage = (e.usage ?? null) as Rec | null
  return {
    reason: e.reason,
    isAborted: e.isAborted,
    isSubagent: e.agentId !== undefined,
    usage: usage && {
      model: maskText(String(usage.model)),
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
    },
    contextAtComplete: context,
  }
}

export function pushTurn(rec: Record_, row: Rec): void {
  rec.turns.push(row)
  if (rec.turns.length > MAX_TURNS) rec.turns.shift()
}

// 古いセッションの記録から消す（store は全セッション合計で 4 MiB まで）
export function staleKeys(keys: readonly string[]): string[] {
  const own = keys.filter((k) => k.startsWith(KEY_PREFIX))
  return own.slice(0, Math.max(0, own.length - MAX_SESSIONS))
}
