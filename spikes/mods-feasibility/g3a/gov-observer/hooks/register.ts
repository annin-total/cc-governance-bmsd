import type { EngineInterface, Register, SettingsSource } from 'claude-code'

type Rec = Record<string, unknown>
type Link = { plugin: string; tier: string; outcome: string; reason?: string; received?: unknown }

const SOURCES: SettingsSource[] = ['user', 'flag', 'policy']

async function _append($: EngineInterface, logPath: string, rec: Rec): Promise<void> {
  const line = JSON.stringify({ at: Date.now(), ...rec })
  $.ui.log(`GOV ${line}`, { to: 'debug' })
  if (!logPath) return
  try {
    const prev = (await $.fs.exists(logPath)) ? String(await $.fs.read(logPath)) : ''
    await $.fs.write(logPath, `${prev}${line}\n`)
  } catch (err) {
    $.ui.log(`GOV write failed: ${String(err)}`, { to: 'debug' })
  }
}

// 各リンクが受け取った e と、自分が受け取った e とで値が違うキー（下の誰かの書き換えの検知）
function _links(trace: readonly Link[], mine: unknown): Rec[] {
  const own = (mine ?? {}) as Rec
  return trace.map(({ plugin, tier, outcome, reason, received }) => {
    const got = (received ?? {}) as Rec
    const changed = Object.keys({ ...own, ...got }).filter((k) => JSON.stringify(own[k]) !== JSON.stringify(got[k]))
    return { plugin, tier, outcome, reason, changed }
  })
}

// 自分の tier の手がかり: userConfig の行の provider と、各 source の prependPlugins
async function _selfTier($: EngineInterface): Promise<Rec> {
  const out: Rec = {}
  try {
    const rows = await $.config.list()
    out.configProvider = rows.filter((r) => r.key.startsWith(`${$.plugin.name}.`)).map((r) => r.provider)
    out.configPluginKeys = rows.filter((r) => r.provider.tier !== 'core').map((r) => `${r.key}:${r.provider.tier}`)
  } catch (err) {
    out.configError = String(err)
  }
  for (const source of SOURCES) {
    try {
      const s = (await $.settings.read({ source })) as Rec
      out[`prepend_${source}`] = s.prependPlugins ?? null
      out[`keys_${source}`] = Object.keys(s)
    } catch (err) {
      out[`prepend_${source}`] = `error: ${String(err)}`
    }
  }
  return out
}

async function _send($: EngineInterface, url: string, body: Rec): Promise<Rec> {
  try {
    const res = await $.http.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, text: res.text.slice(0, 80) }
  } catch (err) {
    return { error: String(err) }
  }
}

export const register: Register = (on, options) => {
  const logPath = String(options.logPath ?? '')
  const sendUrl = String(options.sendUrl ?? '')

  on('plugin.register', async ($, e, next) => {
    await _append($, logPath, { ev: 'plugin.register', name: e.name, tier: e.tier, provenance: e.provenance, events: e.uses.events })
    return next(e)
  })

  // 自分の $ 呼び出しが起こした dispatch: origin に自分の tier が載り、trace に下で答えた者が載る
  on('settings.read', async ($, e, next) => {
    const r = await next(e)
    if (next.origin.plugin === $.plugin.name) await _append($, logPath, { ev: 'settings.read', origin: next.origin, trace: _links(next.trace, e) })
    return r
  })

  on('http.fetch', async ($, e, next) => {
    const r = await next(e)
    if (next.origin.plugin === $.plugin.name) $.ui.log(`GOV own http.fetch trace ${JSON.stringify(_links(next.trace, e))}`, { to: 'debug' })
    return r
  })

  on('session.start', async ($, e, next) => {
    const self = await _selfTier($)
    await _append($, logPath, { ev: 'session.start', phase: 'before', isInteractive: e.isInteractive, ...self })
    if (sendUrl) await _append($, logPath, { ev: 'http.fetch', result: await _send($, sendUrl, { from: 'gov-observer', ...self }) })
    const r = await next(e)
    await _append($, logPath, { ev: 'session.start', phase: 'after', trace: _links(next.trace, e) })
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    await _append($, logPath, { ev: 'prompt.submit', phase: 'before', text: e.text })
    const r = await next(e)
    await _append($, logPath, { ev: 'prompt.submit', phase: 'after', trace: _links(next.trace, e) })
    return r
  })

  on('classic.SessionStart', async ($, e, next) => {
    await _append($, logPath, { ev: 'classic.SessionStart', phase: 'before', source: e.source, session_id: e.session_id })
    const r = await next(e)
    await _append($, logPath, { ev: 'classic.SessionStart', phase: 'after', trace: _links(next.trace, e) })
    return r
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await _append($, logPath, { ev: 'classic.UserPromptSubmit', phase: 'before', prompt: e.prompt, session_id: e.session_id })
    const r = await next(e)
    await _append($, logPath, { ev: 'classic.UserPromptSubmit', phase: 'after', trace: _links(next.trace, e) })
    return r
  })
}
