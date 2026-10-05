import type { On } from 'claude-code'
import { expect, mock } from 'claude-code/testing'

const PLUGIN = 'governance'
export const ENGINE_TEXT = 'drawn by Claude Code'
export const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 39 },
    view: {},
  },
} as const
export const URL_OK = 'https://example.com/a?b=1'
export const NOTICES = [
  { id: 'n1', title: '一件目', body: '本文1', url: URL_OK, label: '手順を見る' },
  { id: 'n2', title: '二件目', body: '本文2', url: URL_OK },
  { id: 'n3', title: '三件目', body: '本文3' },
]

export type World = {
  notices?: unknown
  raw?: string
  saved?: Map<string, unknown>
  env?: Record<string, string>
  failRead?: boolean
  failStoreGet?: boolean
  failStoreSet?: boolean
}

export type Seen = { saved: Map<string, unknown>; logs: string[]; sets: string[]; outcomes: string[]; clock: Clock }
type Clock = ReturnType<typeof mock.clock>
export type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }

const TRACE = 'trace '

type Ui = { find: (q: { key: string }) => Promise<unknown>; press: (q: { key: string }) => Promise<unknown> }

// 上の層に置いた監視用の mod が、governance の hook の決着（skipped・caught 等）を ui.log で知らせる。
// インラインの mod は別のモジュールとして読まれるため、テストの変数を参照できず、イベント名も直書きする
export const WATCHER = {
  name: 'watcher',
  tier: 'prepend' as const,
  register: (on: On) => {
    on('ui.render', async ($, e, next) => {
      const result = await next(e)
      for (const t of next.trace) if (t.plugin === 'governance') $.ui.log(`trace ui.render:${t.outcome}`)
      return result
    })
    on('session.start', async ($, e, next) => {
      const result = await next(e)
      for (const t of next.trace) if (t.plugin === 'governance') $.ui.log(`trace session.start:${t.outcome}`)
      return result
    })
  },
}

export function world(on: On, w: World = {}): Seen {
  const outcomes: string[] = []
  const saved = w.saved ?? new Map<string, unknown>()
  const logs: string[] = []
  const sets: string[] = []
  const raw = w.raw ?? JSON.stringify(w.notices ?? NOTICES)
  mock.env(on, w.env ?? {})
  const clock = mock.clock(on)
  on('fs.read', ($, e) =>
    w.failRead || !e.path.endsWith('/notices.json') ? { deny: 'unreadable' } : { value: raw },
  )
  on('store.get', ($, e) => (w.failStoreGet ? { deny: 'store broken' } : { value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    if (w.failStoreSet) return { deny: 'store broken' }
    sets.push(e.key)
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    if (e.text.startsWith(TRACE)) outcomes.push(e.text.slice(TRACE.length))
    else logs.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: [ENGINE_TEXT] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  return { saved, logs, sets, outcomes, clock }
}

export const OPTS = { plugins: [WATCHER] }

// 例外が try/catch を抜けると、hook の決着が skipped・caught などになる
export function noLeak(w: Seen): void {
  expect(w.outcomes.length > 0).toBe(true)
  expect(w.outcomes.filter(o => !o.endsWith(':returned') && !o.endsWith(':passed'))).toEqual([])
}

export async function children(ui: Ui, id: string): Promise<Drawn[]> {
  const box = (await ui.find({ key: id })) as Drawn | undefined
  return (box?.children ?? []) as Drawn[]
}

// 下の層に置いた別の mod。バンドに自分の行を描き、governance の木と並ぶかを見る
export const OTHER_TEXT = 'drawn by another mod'
export const OTHER = {
  name: 'other',
  tier: 'append' as const,
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>drawn by another mod</Text>
    })
  },
}
