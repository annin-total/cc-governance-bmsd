import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Notice } from '../types'

const COMMAND = 'reapply'
const PANE = 'notices'
const SEEN_KEY = 'seen'
const CTX_WARN_PERCENT = 0
const REAPPLY_ROWS = [
  ['applied', 'env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE'],
  ['already_ok', 'add:extraKnownMarketplaces.governance'],
  ['skipped_conflict', 'once:statusLine'],
] as const

const seenAtom = atom({ plugin: 'governance', key: 'seen' } as const, [])
const warnAtom = atom({ plugin: 'governance', key: 'warn' } as const, null)

async function _notices($: EngineInterface): Promise<Notice[]> {
  const raw = await $.fs.read(`${$.plugin.root}/notices.json`)
  return JSON.parse(raw) as Notice[]
}

async function _unread($: EngineInterface): Promise<Notice[]> {
  const stored = await $.store.get(SEEN_KEY)
  const seen = [...(await read($, seenAtom)), ...(Array.isArray(stored) ? (stored as string[]) : [])]
  return (await _notices($)).filter(n => !seen.includes(n.id))
}

function _format(list: Notice[]): string {
  return list
    .map(n => {
      const body = n.url ? `${n.body ?? ''}\n詳細: ${n.url}` : (n.body ?? '')
      return n.title ? `${n.title}\n${body}` : body
    })
    .join('\n\n')
}

async function _markSeen($: EngineInterface, ids: string[]): Promise<void> {
  const next = await update($, seenAtom, prev => [...new Set([...prev, ...ids])])
  await $.store.set(SEEN_KEY, next)
}

async function _statusLine($: EngineInterface): Promise<string> {
  const [model, cwd, usage] = await Promise.all([$.session.model(), $.session.cwd(), $.session.usage()])
  let branch = '-'
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 500 })
    branch = r.exitCode === 0 ? r.stdout.trim() : `git rc=${r.exitCode}`
  } catch (error) {
    branch = `git failed: ${String(error)}`
  }
  const ctx = usage.context
  return `${model} | ${cwd.split('/').pop()} | ctx ${ctx.percent ?? '-'}% (${ctx.tokens ?? '-'}/${ctx.window}) · $${(usage.cost?.usd ?? 0).toFixed(2)} | ${branch}`
}

async function _modes($: EngineInterface): Promise<string[]> {
  return ((await $.env.get('G4D_MODE')) ?? '').split(',')
}

function dbg($: EngineInterface, text: string): void {
  $.ui.log(`g4d ${text}`, { to: 'debug' })
}

export const register: Register = on => {

  on('classic.SessionStart', async ($, e, next) => {
    const modes = await _modes($)
    dbg($, `classic.SessionStart source=${e.source} modes=${modes.join('+')}`)
    if (modes.includes('toastc')) $.ui.toast(`[classic] ${_format(await _unread($))}`)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const modes = await _modes($)
    const entry = (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) ?? 'unset'
    dbg($, `session.start interactive=${e.isInteractive} surface=${e.surface} entrypoint=${entry}`)
    const stored = await $.store.get(SEEN_KEY)
    await update($, seenAtom, () => (Array.isArray(stored) ? (stored as string[]) : []))
    try {
      const reg = await $.command.register({ name: COMMAND, description: 'g4d: 標準設定の再適用（偽）', argumentHint: '[exit]' })
      dbg($, `command.register -> ${JSON.stringify(reg)}`)
    } catch (error) {
      dbg($, `command.register threw ${String(error)}`)
    }
    if (modes.includes('nsname')) {
      try {
        dbg($, `register governance:reapply -> ${JSON.stringify(await $.command.register({ name: 'governance:reapply', description: 'x' }))}`)
      } catch (error) {
        dbg($, `register governance:reapply threw ${String(error)}`)
      }
    }
    const unread = await _unread($)
    const text = _format(unread)
    if (modes.includes('toast')) $.ui.toast(`[toast] ${text}`)
    if (modes.includes('log')) $.ui.log(`[log] ${text}`)
    if (modes.includes('append')) {
      try {
        const r = await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: `[append] ${text}` }] } })
        dbg($, `append -> ${JSON.stringify(r)}`)
      } catch (error) {
        dbg($, `append threw ${String(error)}`)
      }
    }
    if (modes.includes('pane')) {
      const r = await $.ui.open({ id: PANE, title: 'お知らせ' })
      dbg($, `ui.open -> ${JSON.stringify(r)}`)
    }
    if (modes.includes('status')) $.ui.status(await _statusLine($))
    if (modes.includes('openprobe')) {
      const t0 = await $.clock.now()
      try {
        const r = await $.process.run(['open', '-h'])
        dbg($, `open -h -> rc=${r.exitCode} out=${r.stdout.slice(0, 80)} in ${(await $.clock.now()) - t0}ms`)
      } catch (error) {
        dbg($, `open -h threw ${String(error)}`)
      }
    }
    if (modes.includes('open') && e.isInteractive) {
      const url = unread.find(n => n.url)?.url
      const t0 = await $.clock.now()
      if (url) {
        try {
          const r = await $.process.run(['open', url])
          dbg($, `open url -> rc=${r.exitCode} in ${(await $.clock.now()) - t0}ms`)
        } catch (error) {
          dbg($, `open url threw ${String(error)}`)
        }
      }
    }
    if (modes.includes('logonce') && unread.length > 0) {
      $.ui.log(`[logonce] ${text}`)
      if (e.isInteractive) await _markSeen($, unread.map(n => n.id))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const modes = await _modes($)
    dbg($, `session.measure changed=${e.changed.join(',')} pct=${e.context.percent} cost=${e.cost?.usd}`)
    if (modes.includes('measure') && (e.context.percent ?? 0) >= CTX_WARN_PERCENT) {
      await update($, warnAtom, () => `コンテキストが ${e.context.percent ?? '?'}% に達しました。/compact を検討してください`)
    }
    if (modes.includes('status')) $.ui.status(await _statusLine($))
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const header = '| 結果 | 項目 |\n| --- | --- |'
    const rows = REAPPLY_ROWS.map(([r, k]) => `| ${r} | ${k} |`).join('\n')
    const exit = e.args.trim() === 'exit' ? 3 : 0
    return {
      text: `標準設定を適用し直しました。\n\n${header}\n${rows}\n\n書き込む直前の settings.json は <config_dir>/governance/backups/ に保存されています。\n設定によっては、反映に Claude Code の再起動が要ります。`,
      exitCode: exit,
    }
  })

  on('ui.render', { component: 'CommandOutput', props: { command: COMMAND } }, async ($, e, next) => {
    if (!(await _modes($)).includes('cmdmd')) return next(e)
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={String((e.props as { text?: string }).text ?? '')} />
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await _modes($)).includes('hint')) return next(e)
    const n = (await _unread($)).length
    return n > 0 ? next({ ...e, props: { ...e.props, hint: `${e.props.hint} · お知らせ未読 ${n} 件 (ctrl+x tab で既読)` } }) : next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const warn = await read($, warnAtom)
    const unread = (await _modes($)).includes('band') ? await _unread($) : []
    if (e.props.hasSurvey || (unread.length === 0 && warn === null)) return next(e)
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        {warn !== null && <Text color="yellow">{warn}</Text>}
        {unread.map(n => (
          <Box key={n.id} flexDirection="column">
            <Text bold>{n.title ?? ''}</Text>
            <Text>{n.body ?? ''}</Text>
            {n.url && <Link href={n.url} label="詳細を開く" />}
          </Box>
        ))}
        {unread.length > 0 && (
          <Button key="seen" label="既読にする" hotkey="r" variant="primary" onPress={() => _markSeen($, unread.map(n => n.id))} />
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
    const unread = await _unread($)
    return (
      <Box flexDirection="column">
        {unread.length === 0 && <Text dimColor>未読のお知らせはありません</Text>}
        {unread.map(n => (
          <Box key={n.id} flexDirection="column" marginBottom={1}>
            <Markdown text={`**${n.title ?? ''}**\n\n${n.body ?? ''}`} />
            {n.url && <Link href={n.url} label="詳細を開く" />}
          </Box>
        ))}
        <Button key="seen" label="既読にして閉じる" hotkey="r" onPress={async () => { await _markSeen($, unread.map(n => n.id)); await $.ui.close({ id: PANE }) }} />
      </Box>
    )
  })
}
