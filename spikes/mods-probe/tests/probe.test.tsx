import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ENDPOINT = 'http://127.0.0.1:9/ingest'
const USAGE = {
  model: 'claude-test',
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 30,
  cache_creation_input_tokens: 40,
}
const TURN = { answer: 'ok', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE } as const
const BAND = {
  plugin: 'mods-probe',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

function _world(on: On): void {
  mock.store(on)
  mock.clock(on, { now: 1000 })
  mock.env(on, {})
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 5 }, rateLimits: [] } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

test('Bash の目印入りコマンドだけを拒否する', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const denied = await $.tool.call({ tool: 'Bash', command: 'echo MODS_PROBE_DENY' } as never)
  expect(denied.deny).toMatch(/MODS_PROBE_DENY/)
  const passed = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
  expect(passed.deny).toBeUndefined()
})

test('Bash ガードが例外を投げたら拒否する', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const denied = await $.tool.call({ tool: 'Bash' } as never)
  expect(denied.deny).toMatch(/ガードが失敗/)
})

test('ターンの使用量を貯め、flush で POST して空にする', { options: { endpoint: ENDPOINT } }, async ($, on) => {
  _world(on)
  const posted: string[] = []
  on('http.fetch', ($, e) => {
    posted.push(`${e.url} ${e.init?.body ?? ''}`)
    return { value: { status: 200, ok: true, headers: {}, text: '' } } as never
  })
  await $.turn.complete(TURN as never)
  const out = await $.command.run({ command: 'mods-probe', args: 'flush' } as never)
  expect(out.text).toMatch(/HTTP 200, records=1/)
  expect(out.text).toMatch(/buffered=0/)
  expect(posted[0]).toContain(ENDPOINT)
  expect(posted[0]).toContain('"cacheReadTokens":30')
})

test('送信が例外で失敗したら failed を見せて貯めたままにする', { options: { endpoint: ENDPOINT } }, async ($, on) => {
  _world(on)
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  await $.turn.complete(TURN as never)
  const out = await $.command.run({ command: 'mods-probe', args: 'flush' } as never)
  expect(out.text).toMatch(/lastFlush=failed: .*records=1/)
  expect(out.text).toMatch(/buffered=1/)
})

test('送信先が空なら送らずに貯めたままにする', async ($, on) => {
  _world(on)
  await $.turn.complete(TURN as never)
  const out = await $.command.run({ command: 'mods-probe', args: 'flush' } as never)
  expect(out.text).toMatch(/skipped \(endpoint=none, buffered=1\)/)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`バンドが直前のターンを表示し Hide で消える（${surface}）`, async ($, on) => {
    _world(on)
    await $.turn.complete(TURN as never)
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect(await ui.find({ type: 'Text', text: /in=10 out=20 cacheR=30/ } as never)).toBeDefined()
    await ui.press({ key: 'hide' } as never)
    expect(await ui.find({ type: 'Text', text: /mods-probe/ } as never)).toBeUndefined()
    await ui.unmount()
  })
}
