import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TurnRecord } from '../types'

const COMMAND = 'mods-probe'
const DENY_MARKER = 'MODS_PROBE_DENY'
const BUFFER_KEY = 'buffer'
const BUFFER_MAX = 500
const FLUSH_INTERVAL_MS = 60_000

const last = atom({ plugin: 'mods-probe', key: 'last' } as const, null)
const isHidden = atom({ plugin: 'mods-probe', key: 'isHidden' } as const, false)

async function _loadBuffer($: EngineInterface): Promise<TurnRecord[]> {
  const value = await $.store.get(BUFFER_KEY)
  return Array.isArray(value) ? (value as TurnRecord[]) : []
}

async function _flush($: EngineInterface, endpoint: string): Promise<string> {
  const buffer = await _loadBuffer($)
  if (endpoint === '' || buffer.length === 0) {
    return `skipped (endpoint=${endpoint || 'none'}, buffered=${buffer.length})`
  }
  const res = await $.http.fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buffer),
  })
  if (res.ok) {
    await $.store.set(BUFFER_KEY, [])
  }
  return `HTTP ${res.status}, records=${buffer.length}`
}

export const register: Register = (on, options) => {
  const endpoint = String(options.endpoint ?? '')
  const counts = { prompts: 0, tools: 0, toolErrors: 0, classicStops: 0 }
  let lastFlush = 'never'
  let version = 'unknown'
  let isInteractive = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'mods-probe の観測値を表示する（引数 flush で即時送信）' })
    version = (await $.session.version()).version
    isInteractive = e.isInteractive
    $.ui.toast(`mods-probe loaded on ${version}`)
    if (endpoint !== '') {
      $.clock.every(FLUSH_INTERVAL_MS, async () => {
        lastFlush = await _flush($, endpoint)
      })
    }
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    counts.prompts += 1
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    counts.tools += 1
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true) {
      counts.toolErrors += 1
    }
    return ran
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    e.command.includes(DENY_MARKER) ? { deny: `mods-probe: ${DENY_MARKER} を含むコマンドは拒否する` } : next(e),
  ).catch(($, e, next) => ({ deny: `mods-probe: ガードが失敗したため実行しない (${next.error.kind})` }))

  on('turn.complete', async ($, e, next) => {
    if (e.usage !== undefined) {
      const record: TurnRecord = {
        at: await $.clock.now(),
        model: e.usage.model,
        inputTokens: e.usage.input_tokens,
        outputTokens: e.usage.output_tokens,
        cacheReadTokens: e.usage.cache_read_input_tokens,
        cacheWriteTokens: e.usage.cache_creation_input_tokens,
        durationMs: e.durationMs,
        isSubagent: e.agentId !== undefined,
      }
      await $.store.set(BUFFER_KEY, [...(await _loadBuffer($)), record].slice(-BUFFER_MAX))
      if (!record.isSubagent) {
        await update($, last, () => record)
      }
    }
    const usage = await $.session.usage()
    $.ui.status(`ctx ${usage.context.percent ?? '-'}% · $${(usage.cost?.usd ?? 0).toFixed(2)}`)
    return next(e)
  })

  on('classic.Stop', ($, e, next) => {
    counts.classicStops += 1
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    lastFlush = await _flush($, endpoint)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'flush') {
      lastFlush = await _flush($, endpoint)
    }
    const buffered = (await _loadBuffer($)).length
    const env = (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) ?? 'unset'
    return {
      text: [
        `version=${version} interactive=${isInteractive} entrypoint=${env}`,
        `prompts=${counts.prompts} tools=${counts.tools} toolErrors=${counts.toolErrors} classicStops=${counts.classicStops}`,
        `buffered=${buffered} lastFlush=${lastFlush}`,
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (e.props.hasSurvey || turn === null || (await read($, isHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          mods-probe: {turn.model} in={turn.inputTokens} out={turn.outputTokens} cacheR={turn.cacheReadTokens}{' '}
        </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
