import { expect, test } from 'claude-code/testing'

import type { Drawn } from './world'
import { BAND, ENGINE_TEXT, NOTICES, OPTS, OTHER, OTHER_TEXT, URL_OK, WATCHER, children, noLeak, world } from './world'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`未読を全件、title・body・Link・薄い URL・既読ボタン付きで並べる（${surface}）`, OPTS, async ($, on) => {
    const w = world(on)
    const ui = await $.ui.mount({ ...BAND, surface })
    for (const n of NOTICES) {
      expect(await ui.find({ type: 'Text', text: n.title })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: n.body })).toBeDefined()
      expect(await ui.find({ key: `seen:${n.id}` })).toMatchObject({ type: 'Button', props: { label: '既読にする' } })
      expect((await ui.find({ key: `seen:${n.id}` }))?.props?.hotkey).toBeUndefined()
    }
    const n1 = await children(ui, 'n1')
    expect(n1.find(c => c.type === 'Link')).toMatchObject({ props: { href: URL_OK, label: '手順を見る' } })
    expect(n1.find(c => c.type === 'Text' && c.props?.dimColor)).toMatchObject({ children: [URL_OK] })
    expect((await children(ui, 'n2')).find(c => c.type === 'Link')).toMatchObject({ props: { label: '詳細を開く' } })
    expect((await children(ui, 'n3')).find(c => c.type === 'Link')).toBeUndefined()
    const row = n1[0]?.children as Drawn[]
    expect(row.map(c => c.type)).toEqual(['Button', 'Text'])
    expect(row[1]).toMatchObject({ props: { bold: true }, children: ['一件目'] })
    expect((await ui.find({ type: 'Button', text: /既読/ }))?.props).toMatchObject({ key: 'seen:n1' })
    expect(await ui.find({ type: 'Text', text: /ctrl\+x tab.*Enter/ })).toMatchObject({ props: { dimColor: true } })
    expect(await ui.find({ type: 'Text', text: ENGINE_TEXT })).toBeDefined()
    expect(w.sets).toEqual([])
    noLeak(w)
  })
}

test('既読ボタンは ID ごとのキーに書き、そのお知らせだけが以後出ない', OPTS, async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'seen:n2' })
  expect(w.sets).toEqual(['seen:n2'])
  expect(w.saved.get('seen:n2')).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '二件目' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '一件目' })).toBeDefined()
  await ui.unmount()
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: '二件目' })).toBeUndefined()
  expect(await again.find({ type: 'Text', text: '三件目' })).toBeDefined()
  noLeak(w)
})

test('押してから 1 秒の間の次の押下は無視し、Enter の二度押しで次のお知らせを既読にしない', OPTS, async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'seen:n1' })
  await w.clock.advance(999)
  await ui.press({ key: 'seen:n2' })
  expect(w.sets).toEqual(['seen:n1'])
  expect(await ui.find({ type: 'Text', text: '二件目' })).toBeDefined()
  await w.clock.advance(1)
  await ui.press({ key: 'seen:n2' })
  expect(w.sets).toEqual(['seen:n1', 'seen:n2'])
  noLeak(w)
})

test('下の層の mod がバンドに描いたものと並べて描く', { plugins: [WATCHER, OTHER] }, async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: OTHER_TEXT })).toBeDefined()
  expect(await ui.find({ key: 'seen:n1' })).toBeDefined()
  noLeak(w)
})

test('すべて既読ならバンドを描かない', OPTS, async ($, on) => {
  const w = world(on, { saved: new Map<string, unknown>(NOTICES.map(n => [`seen:${n.id}`, true])) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: ENGINE_TEXT })).toBeDefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  noLeak(w)
})

test('アンケートが出ている間は譲る', OPTS, async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: ENGINE_TEXT })).toBeDefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  noLeak(w)
})

test('-p では ui.log で全件出し、既読にしない', OPTS, async ($, on) => {
  const w = world(on)
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as never)
  expect(w.logs.length).toBe(NOTICES.length)
  expect(w.logs[0]).toContain('一件目')
  expect(w.logs[0]).toContain('本文1')
  expect(w.logs[0]).toContain(URL_OK)
  expect(w.sets).toEqual([])
  noLeak(w)
})

test('対話のセッション開始では ui.log を出さない', OPTS, async ($, on) => {
  const w = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as never)
  expect(w.logs).toEqual([])
  noLeak(w)
})

test('/clear の後も未読を描く', OPTS, async ($, on) => {
  const w = world(on, { saved: new Map<string, unknown>([['seen:n1', true]]) })
  await $.classic.SessionStart({ source: 'clear' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '二件目' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '一件目' })).toBeUndefined()
  noLeak(w)
})

test('無効化スイッチが立っていれば描かず、ui.log も出さない', OPTS, async ($, on) => {
  const w = world(on, { env: { CC_GOVERNANCE_DISABLE: '1' } })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as never)
  expect(w.logs).toEqual([])
  noLeak(w)
})
