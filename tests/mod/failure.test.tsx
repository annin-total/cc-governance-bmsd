import { expect, test } from 'claude-code/testing'

import type { World } from './world'
import { URL_CASES } from './url_cases'
import { BAND, ENGINE_TEXT, OPTS, URL_OK, children, noLeak, world } from './world'

test('壊れた要素は飛ばし、ほかは出す', OPTS, async ($, on) => {
  const notices = [null, 1, 'x', [], { id: 1, title: 't', body: 'b' }, { id: 'nt', body: 'b' }, { id: 'nb', title: 't' },
    { id: '', title: 't', body: 'b' }, { id: 'ok', title: '正常', body: '本文', url: URL_OK, label: 3 }]
  const w = world(on, { notices })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '正常' })).toBeDefined()
  expect((await children(ui, 'ok')).find(c => c.type === 'Link')).toMatchObject({ props: { label: '詳細を開く' } })
  expect(await ui.find({ key: 'seen:nt' })).toBeUndefined()
  expect(await ui.find({ key: 'seen:nb' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /既読/ })).toMatchObject({ props: { key: 'seen:ok' } })
  noLeak(w)
})

test('URL の判定は validate と同じ表に従う', OPTS, async ($, on) => {
  const w = world(on, { notices: URL_CASES.map(([url], i) => ({ id: `c${i}`, title: `t${i}`, body: 'b', url })) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const linked = await Promise.all(URL_CASES.map(async (_, i) => (await children(ui, `c${i}`)).some(c => c.type === 'Link')))
  expect(linked).toEqual(URL_CASES.map(([, expected]) => expected))
  expect(await ui.find({ key: `seen:c${URL_CASES.findIndex(([, ok]) => !ok)}` })).toBeDefined()
  noLeak(w)
})

const FAILURES: [string, World][] = [
  ['notices.json が読めない', { failRead: true }],
  ['notices.json が壊れている', { raw: '{not json' }],
  ['notices.json が配列でない', { raw: '{"id":"x"}' }],
  ['store が読めない', { failStoreGet: true }],
]
for (const [name, failure] of FAILURES) {
  test(`${name}とき、例外を外へ出さずに何も描かない`, OPTS, async ($, on) => {
    const w = world(on, failure)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: ENGINE_TEXT })).toBeDefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as never)
    expect(w.logs).toEqual([])
    noLeak(w)
  })
}

test('既読の書き込みが失敗しても例外を外へ出さず、お知らせは残る', OPTS, async ($, on) => {
  const w = world(on, { failStoreSet: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'seen:n1' })
  expect(await ui.find({ type: 'Text', text: '一件目' })).toBeDefined()
  noLeak(w)
})
